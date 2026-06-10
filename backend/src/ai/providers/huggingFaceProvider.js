import { BaseAIProvider } from './baseProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { semanticQuestionSchema } from '../../validators/questionValidators.js';

function extractJSON(str) {
  const firstBracket = str.indexOf('[');
  const lastBracket = str.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return str.slice(firstBracket, lastBracket + 1);
  }
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return str.slice(firstBrace, lastBrace + 1);
  }
  return str;
}

export class HuggingFaceProvider extends BaseAIProvider {
  constructor() {
    super('huggingface');
    this.models = [
      'Qwen/Qwen2.5-7B-Instruct',
      'Qwen/Qwen3-8B',
      'mistralai/Mistral-7B-Instruct-v0.3',
      'google/gemma-2-9b-it',
      'meta-llama/Llama-3.1-8B-Instruct'
    ];
  }

  isConfigured() {
    return Boolean(env.ai.hfToken);
  }

  async _callHF(modelId, systemInstruction, prompt) {
    const url = `https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.ai.hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(env.ai.requestTimeoutMs),
    });

    if (!res.ok) {
      throw new Error(`HF HTTP error status ${res.status}`);
    }

    const body = await res.json();
    return body.choices?.[0]?.message?.content || '';
  }

  async classify(question, catalog, docMeta = {}) {
    if (!this.isConfigured()) return null;

    // Build syllabus-constrained prompt context if syllabus catalog is available
    let syllabusContext = '';
    if (catalog?.syllabus) {
      try {
        const { buildSyllabusPromptContext } = await import('../syllabusCatalog.js');
        syllabusContext = buildSyllabusPromptContext(catalog.syllabus);
      } catch (err) {
        logger.warn('[huggingface] Failed to build syllabus prompt context', { error: err.message });
      }
    }

    const subjectsList = (catalog?.subjects || []).map((s) => s.name).join(', ') || 'Physics, Chemistry, Mathematics, Biology';

    const sysInstructionParts = [
      'You are a professional educational document parser and question classifier.',
      'You MUST analyze the input question and classify it according to standard Indian educational curricula (JEE, NEET, CBSE).',
    ];

    if (syllabusContext) {
      sysInstructionParts.push('\nThe following is the EXACT list of available subjects, chapters, topics, exam patterns, and classes from the syllabus tree. You MUST select ONLY from these existing options. Do NOT generate any new or made-up subject, chapter, or topic names.');
      sysInstructionParts.push(syllabusContext);
      sysInstructionParts.push('\nCRITICAL: subjectHint MUST be one of the subject names from the list above - nothing else.');
      sysInstructionParts.push('\nCRITICAL: topicHint MUST be one of the chapter or topic names from the list above under the chosen subject - nothing else.');
      sysInstructionParts.push('\nCRITICAL: examTypeHint MUST be one of the exam pattern names from the list above - nothing else.');
      sysInstructionParts.push('\nCRITICAL: difficulty MUST be exactly one of: "easy", "medium", "hard" - nothing else.');
    } else {
      sysInstructionParts.push(`Available subjects: ${subjectsList}`);
    }

    const systemInstruction = sysInstructionParts.join('\n') + `
You MUST return a raw JSON object matching this schema exactly. DO NOT add any extra fields:
{
  "class": number, // an integer from 6 to 12
  "difficulty": string, // ONLY "easy", "medium", or "hard"
  "questionType": string, // "mcq", "numerical", or "descriptive"
  "subjectHint": string, // One of the allowed subjects from the list - NOTHING ELSE
  "topicHint": string, // Specific chapter or topic name from the available list - NOTHING ELSE
  "examTypeHint": string, // Exam pattern name from the available list - NOTHING ELSE
  "confidence": number // float between 0.0 and 1.0
}
DO NOT wrap the response in markdown blocks or include any extra commentary. Output ONLY valid JSON.`;

    const prompt = `Classify this question:
Question Text:
${question.questionText || ''}

Options:
${(question.options || []).map((o, idx) => `${String.fromCharCode(65 + idx)}. ${o.text}`).join('\n')}

Additional Context:
${JSON.stringify(docMeta)}`;

    for (const modelId of this.models) {
      try {
        logger.info(`[huggingface] Attempting classification with model: ${modelId}`);
        const responseText = await this._callHF(modelId, systemInstruction, prompt);
        const parsed = JSON.parse(extractJSON(responseText || '{}'));
        logger.info(`[huggingface] Classification success with model: ${modelId}`);
        return {
          class: parsed.class ? Number(parsed.class) : undefined,
          difficulty: parsed.difficulty,
          questionType: parsed.questionType,
          confidence: Number(parsed.confidence) || 0.45,
          hints: {
            subject: parsed.subjectHint,
            topic: parsed.topicHint,
            examType: parsed.examTypeHint,
          },
        };
      } catch (err) {
        logger.warn(`[huggingface] Model ${modelId} failed during classification`, { error: err.message });
      }
    }
    return null; // Fallback to Rules-Based Classifier
  }

  async classifyBatch(questions, catalog, docMeta = {}) {
    if (!this.isConfigured()) return null;

    // Build syllabus-constrained prompt context if syllabus catalog is available
    let syllabusContext = '';
    if (catalog?.syllabus) {
      try {
        const { buildSyllabusPromptContext } = await import('../syllabusCatalog.js');
        syllabusContext = buildSyllabusPromptContext(catalog.syllabus);
      } catch (err) {
        logger.warn('[huggingface] Failed to build syllabus prompt context for batch', { error: err.message });
      }
    }

    const subjectsList = (catalog?.subjects || []).map((s) => s.name).join(', ') || 'Physics, Chemistry, Mathematics, Biology';

    const sysInstructionParts = [
      'You are a professional educational document parser and question classifier.',
      'Analyze the input list of questions and classify each according to standard Indian educational curricula (JEE, NEET, CBSE).',
    ];

    if (syllabusContext) {
      sysInstructionParts.push('\nThe following is the EXACT list of available subjects, chapters, topics, exam patterns, and classes from the syllabus tree. You MUST select ONLY from these existing options. Do NOT generate any new or made-up subject, chapter, or topic names.');
      sysInstructionParts.push(syllabusContext);
      sysInstructionParts.push('\nCRITICAL: subjectHint MUST be one of the subject names from the list above - nothing else.');
      sysInstructionParts.push('\nCRITICAL: topicHint MUST be one of the chapter or topic names from the list above under the chosen subject - nothing else.');
      sysInstructionParts.push('\nCRITICAL: examTypeHint MUST be one of the exam pattern names from the list above - nothing else.');
      sysInstructionParts.push('\nCRITICAL: difficulty MUST be exactly one of: "easy", "medium", "hard" - nothing else.');
    } else {
      sysInstructionParts.push(`Available subjects: ${subjectsList}`);
    }

    const systemInstruction = sysInstructionParts.join('\n') + `
You MUST return a JSON array of objects, where each object corresponds to a question in the input list, matching this schema exactly. DO NOT add any extra fields:
[
  {
    "class": number, // an integer from 6 to 12
    "difficulty": string, // ONLY "easy", "medium", or "hard"
    "questionType": string, // "mcq", "numerical", or "descriptive"
    "subjectHint": string, // One of the allowed subjects from the list - NOTHING ELSE
    "topicHint": string, // Specific chapter or topic name from the available list - NOTHING ELSE
    "examTypeHint": string, // Exam pattern name from the available list - NOTHING ELSE
    "confidence": number // float between 0.0 and 1.0
  },
  ...
]
DO NOT wrap the response in markdown blocks or include any extra commentary. Output ONLY valid JSON array.`;

    const prompt = `Classify this batch of ${questions.length} questions:
${questions.map((q, idx) => `
--- Question ${idx + 1} ---
Text: ${q.questionText || ''}
Options: ${(q.options || []).map((o, oIdx) => `${String.fromCharCode(65 + oIdx)}. ${o.text}`).join('\n')}
`).join('\n')}`;

    for (const modelId of this.models) {
      try {
        logger.info(`[huggingface] Attempting batch classification with model: ${modelId}`);
        const responseText = await this._callHF(modelId, systemInstruction, prompt);
        const parsed = JSON.parse(extractJSON(responseText || '[]'));
        if (Array.isArray(parsed) && parsed.length === questions.length) {
          logger.info(`[huggingface] Batch classification success with model: ${modelId}`);
          return parsed.map((p) => ({
            class: p.class ? Number(p.class) : undefined,
            difficulty: p.difficulty,
            questionType: p.questionType,
            confidence: Number(p.confidence) || 0.45,
            hints: {
              subject: p.subjectHint,
              topic: p.topicHint,
              examType: p.examTypeHint,
            },
          }));
        }
        logger.warn(`[huggingface] Model ${modelId} returned invalid batch array or length mismatch.`);
      } catch (err) {
        logger.warn(`[huggingface] Model ${modelId} failed during batch classification`, { error: err.message });
      }
    }
    return null;
  }

  async refineQuestion(parserResult, cleanedPlainText) {
    if (!this.isConfigured()) return null;

    const systemInstruction = `You are a professional educational document parser and question refiner.
Analyze the pre-parsed question structure and raw clean text, repair any minor OCR or formatting errors, identify sub-elements, and output a valid JSON object matching this schema exactly:
{
  "questionType": "MCQ_SINGLE|MCQ_MULTI|INTEGER|NUMERICAL|ASSERTION_REASON|MATCH_COLUMNS|COMPREHENSION|STATEMENT_SET|MATRIX_MATCH|TRUE_FALSE|NESTED_OPTION_MCQ|DESCRIPTIVE|CASE_STUDY",
  "stem": "question text stem only, preserving all MATHPLACEHOLDER<num> tokens exactly",
  "options": [{"text": "option content text, preserving all MATHPLACEHOLDER<num> tokens exactly"}],
  "correctAnswers": ["A", "B", "etc"],
  "explanation": "detailed step-by-step solution / explanation, preserving all MATHPLACEHOLDER<num> tokens exactly",
  "statementGroups": ["statement 1", "statement 2", "etc, preserving all MATHPLACEHOLDER<num> tokens exactly"],
  "formulas": ["MATHPLACEHOLDER0", "etc"],
  "tags": ["topic_tag", "needs_review_tag", "etc"]
}

Guidelines:
1. Fix OCR mistakes and formatting.
2. The text contains math placeholders in the format MATHPLACEHOLDER<number> (e.g., MATHPLACEHOLDER0, MATHPLACEHOLDER1). You MUST preserve these tokens exactly as they are. Never translate them back to mathematical equations, alter their numbers, remove them, or modify them.
3. For probability like P(A) or P(B), do NOT treat A/B as MCQ options.
4. For nested structures (STATEMENT_SET, NESTED_OPTION_MCQ): isolate the statements in 'statementGroups', and place the final option combinations in the 'options' list.
5. Output ONLY valid JSON, with NO markdown code wrappers (like \`\`\`json) or conversational prefix/suffix text.`;

    const prompt = `Refine this question block:
PARSED INPUT:
${JSON.stringify({
  questionText: (parserResult.questionText || '').slice(0, 1500),
  questionType: parserResult.questionType,
  options: (parserResult.options || []).slice(0, 8).map((o) => o.text),
})}

RAW CLEANED TEXT:
${(cleanedPlainText || '').slice(0, 2500)}`;

    for (const modelId of this.models) {
      try {
        logger.info(`[huggingface] Attempting semantic refinement with model: ${modelId}`);
        const responseText = await this._callHF(modelId, systemInstruction, prompt);
        const parsed = JSON.parse(extractJSON(responseText || '{}'));

        const validationResult = semanticQuestionSchema.safeParse(parsed);
        if (!validationResult.success) {
          logger.warn(`[huggingface] Model ${modelId} returned invalid schema object during refinement`);
          continue;
        }

        logger.info(`[huggingface] Semantic refinement success with model: ${modelId}`);
        const validatedData = validationResult.data;
        const finalOptions = validatedData.options.map((o) => {
          if (typeof o === 'string') return { text: o };
          return { text: o.text || '' };
        });
        const finalCorrectAnswers = Array.isArray(validatedData.correctAnswers)
          ? validatedData.correctAnswers
          : [validatedData.correctAnswers].filter(Boolean);

        return {
          ...validatedData,
          options: finalOptions,
          correctAnswers: finalCorrectAnswers,
        };
      } catch (err) {
        logger.warn(`[huggingface] Model ${modelId} failed during semantic refinement`, { error: err.message });
      }
    }
    return null;
  }
}
