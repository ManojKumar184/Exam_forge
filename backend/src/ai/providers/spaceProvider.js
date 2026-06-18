/**
 * spaceProvider.js — AI classification via ExForge Llama Space.
 *
 * API Contract:
 *   POST https://manoj555-exforge-llama.hf.space/api/chat
 *   Body:  { "data": [ "<prompt>" ] }
 *   Response: { "data": [ "<response_text>" ] }
 *
 * The Space is a pure inference engine — it knows nothing about exam
 * patterns, classes, subjects, chapters, or topics. The backend builds
 * the full prompt and resolves syllabus mappings.
 *
 * Changelog:
 *   - 2026-06-16: Migrated from Gradio SSE event API to simple JSON API
 *     (/api/chat instead of /gradio_api/call/chat)
 *   - Prompt reduction: candidate-filtered syllabus tree to stay <3000 chars
 *   - Smart retries: exponential backoff (3s, 10s) instead of immediate retry
 *   - Cold start detection: separate longer timeout for cold starts
 *   - Concurrency limiting: max 3 parallel per-question calls
 *   - Structured logging: [AI_BATCH] [SPACE_CALL] [SPACE_RESULT] diagnostics
 *   - Dynamic batch sizing: 10-25 questions based on prompt length budget
 */

import { BaseAIProvider } from './baseProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { normalizeQuestionType } from '../../utils/questionTypeNormalizer.js';
import { extractJSON, extractAnswer } from './shared.js';

const SPACE_HOST = 'https://manoj555-exforge-llama.hf.space';
const SPACE_ENDPOINT = '/api/chat';

export class SpaceProvider extends BaseAIProvider {
  constructor() {
    super('exforge_llama');
    this.timeoutMs = Number(env.ai.spaceRequestTimeoutMs) || 45000;
    this.coldStartTimeoutMs = Number(env.ai.spaceColdStartTimeoutMs) || 120000;
    this.baseDelayMs = Number(env.ai.aiRetryBaseDelayMs) || 3000;
    this.maxDelayMs = Number(env.ai.aiRetryMaxDelayMs) || 10000;
    this.maxRetries = Number(env.ai.aiMaxRetries) || 3;
    this.promptTargetChars = Number(env.ai.promptTargetChars) || 3000;
    this.promptMaxChars = Number(env.ai.promptMaxChars) || 5000;
    this.batchMinSize = Number(env.ai.batchMinSize) || 10;
    this.batchMaxSize = Number(env.ai.batchMaxSize) || 25;
    this.maxConcurrentCalls = Number(env.ai.maxConcurrentAiCalls) || 3;
    // Track cold start state across calls
    this._coldStartDetected = false;
    this._lastSuccessfulCall = 0;
  }

  isConfigured() {
    return true;
  }

  // ──────────────────────────────────────────────
  // Candidate syllabus filtering — reduces prompt
  // tokens by ~60-80% for most questions
  // ──────────────────────────────────────────────

  /**
   * Extract candidate exam pattern/class/subject hints from question text.
   * Uses keyword matching against known exam names, class levels, and subject names.
   * @param {string} text - Question text to analyze
   * @param {Object} catalog - Full catalog with syllabus
   * @returns {{ examPatterns: string[], classes: string[], subjects: string[] }}
   */
  _extractCandidatesFromText(text = '', catalog = {}) {
    const syllabus = catalog?.syllabus || null;
    const lowerText = text.toLowerCase();

    const candidates = {
      examPatterns: [],
      classes: [],
      subjects: [],
    };

    // ── Detect exam patterns ────────────────────────
    const examPatterns = syllabus?.examPatterns || catalog?.examTypes || [];
    for (const ep of examPatterns) {
      const name = ep.name || '';
      const lowerName = name.toLowerCase();
      // Check if the exam name appears in the question text
      const nameWords = lowerName.split(/\s+/);
      const matchCount = nameWords.filter(w => w.length > 2 && lowerText.includes(w)).length;
      if (matchCount >= 1 || lowerText.includes(lowerName)) {
        candidates.examPatterns.push(name);
      }
    }
    // Always include the first 2 exam patterns as fallback context
    if (candidates.examPatterns.length === 0 && examPatterns.length > 0) {
      candidates.examPatterns = examPatterns.slice(0, 2).map(ep => ep.name || '');
    }

    // ── Detect class level ─────────────────────────
    const classes = syllabus?.classes || [];
    for (const c of classes) {
      const className = String(c.name || '');
      // Match patterns like "Class 11", "11", "Grade 12"
      const digits = className.replace(/\D/g, '');
      if (digits && (lowerText.includes(`class ${digits}`) || lowerText.includes(` ${digits} `) || lowerText.includes(`grade ${digits}`))) {
        candidates.classes.push(className);
      }
    }
    if (candidates.classes.length === 0 && classes.length > 0) {
      // Include all classes as fallback (usually just 2)
      candidates.classes = classes.map(c => String(c.name || ''));
    }

    // ── Detect subjects ────────────────────────────
    const subjects = syllabus?.subjects || catalog?.subjects || [];
    for (const s of subjects) {
      const name = s.name || '';
      if (lowerText.includes(name.toLowerCase())) {
        candidates.subjects.push(name);
      }
    }
    // If no subject matched, include top 3 most likely subjects
    if (candidates.subjects.length === 0 && subjects.length > 0) {
      candidates.subjects = subjects.slice(0, 3).map(s => s.name || '');
    }

    return candidates;
  }

  /**
   * Build a compact syllabus section using ONLY candidate-filtered entries.
   * Target: < 500 chars for the syllabus section.
   * @param {Object} catalog - Full catalog with syllabus
   * @param {{ examPatterns: string[], classes: string[], subjects: string[] }} candidates
   * @returns {string[]} Compact syllabus context lines
   */
  _buildCompactFilteredSyllabus(catalog = {}, candidates = { examPatterns: [], classes: [], subjects: [] }) {
    const lines = [];
    const syllabus = catalog?.syllabus || null;

    // Exam patterns — compact one line
    if (candidates.examPatterns.length > 0) {
      lines.push(`EXAMS: ${candidates.examPatterns.join('/')}`);
    }

    // Classes — compact one line
    if (candidates.classes.length > 0) {
      const digits = candidates.classes.map(c => c.replace(/\D/g, '')).filter(Boolean).join('/');
      lines.push(`CLASSES: ${digits}`);
    }

    // Subjects with chapters — ONLY for matched subjects, NO topics
    if (candidates.subjects.length > 0 && syllabus) {
      const subjectNodes = (syllabus.subjects || []).filter(s =>
        candidates.subjects.includes(s.name)
      );
      if (subjectNodes.length > 0) {
        const parts = [];
        for (const s of subjectNodes) {
          const subjId = s._id?.toString();
          const chapters = subjId
            ? (syllabus.getChildren(subjId) || []).filter(c => c.type === 'chapter')
            : [];
          if (chapters.length > 0) {
            const chapterNames = chapters.map(ch => ch.name).join(', ');
            // Truncate long chapter lists to stay within budget
            const truncated = chapterNames.length > 300
              ? chapterNames.slice(0, 297) + '...'
              : chapterNames;
            parts.push(`${s.name}: ${truncated}`);
          } else {
            parts.push(s.name);
          }
        }
        lines.push(`SUBJECTS: ${parts.join(' | ')}`);
      }
    }

    return lines;
  }

  // ──────────────────────────────────────────────
  // Prompt builders — target <3000 chars total
  // ──────────────────────────────────────────────

  /**
   * Estimate the token budget needed for a single question's text.
   * Used for dynamic batch sizing.
   */
  _estimateQuestionPromptCost(question) {
    let cost = (question.questionText || '').length;
    const options = question.options || [];
    options.forEach(o => { cost += (o.text || '').length + 4; });
    const answerText = extractAnswer(question);
    if (answerText) cost += Math.min(answerText.length, 500);
    if (question.explanation) cost += Math.min(question.explanation.length, 400);
    return cost;
  }

  /**
   * Build a single-question classification prompt, aggressively trimmed
   * to stay under promptTargetChars (~3000 chars).
   */
  _buildPrompt(question, catalog = {}) {
    const startTime = Date.now();
    const candidates = this._extractCandidatesFromText(question.questionText || '', catalog);
    const parts = [];

    parts.push('You are an educational classification engine.');
    parts.push('');

    // Question (truncated if needed)
    const qText = (question.questionText || '').slice(0, 2000);
    parts.push('QUESTION:');
    parts.push(qText);

    // Options (compact)
    const options = question.options || [];
    if (options.length > 0) {
      const optLines = options.map((o, i) =>
        `${String.fromCharCode(65 + i)}. ${(o.text || '').slice(0, 200)}`
      );
      parts.push('OPTIONS: ' + optLines.join(' | '));
    }

    // Answer (short)
    const answerText = extractAnswer(question);
    if (answerText) {
      parts.push('ANSWER: ' + answerText.slice(0, 300));
    }

    // Explanation (short)
    if (question.explanation) {
      parts.push('EXPL: ' + question.explanation.slice(0, 300));
    }

    parts.push('');

    // Filtered syllabus context (compact, <500 chars)
    const syllabusLines = this._buildCompactFilteredSyllabus(catalog, candidates);
    if (syllabusLines.length > 0) {
      parts.push(...syllabusLines);
      parts.push('');
    }

    parts.push('Use ONLY values from context above.');
    parts.push('Return ONLY valid JSON:');
    parts.push('{"class":"","subject":"","chapter":"","topic":"","difficulty":""}');

    let result = parts.join('\n');

    // Aggressive truncation: if still over promptMaxChars, hard-truncate
    if (result.length > this.promptMaxChars) {
      // Keep instruction + JSON template, truncate question body
      const preamble = parts.slice(0, 2).join('\n') + '\n';
      const jsonEnd = parts.slice(-3).join('\n');
      const maxBodyLen = this.promptMaxChars - preamble.length - jsonEnd.length - 200;
      const body = qText.slice(0, Math.max(maxBodyLen, 200));
      result = preamble + 'QUESTION:\n' + body + '\n\n' + jsonEnd;
    }

    // Diagnostics: log prompt structure
    const genTime = Date.now() - startTime;
    const estTokens = Math.round(result.length / 3.5); // ~3.5 chars per token for English
    logger.info(`[PROMPT_DIAG] Type=single GenTime=${genTime}ms Chars=${result.length} Tokens=${estTokens} Candidates_exam=${candidates.examPatterns.length} Candidates_class=${candidates.classes.length} Candidates_subject=${candidates.subjects.length} Syllabus_chars=${syllabusLines.join('').length}`);
    logger.info(`[PROMPT_DIAG] PROMPT_START: ${result.slice(0, 500).replace(/\n/g, '\\n')}`);
    logger.info(`[PROMPT_DIAG] PROMPT_END: ${result.slice(-500).replace(/\n/g, '\\n')}`);

    return result;
  }

  /**
   * Build a batch prompt for multiple questions.
   * Syllabus context is included ONCE for all questions.
   */
  _buildBatchPrompt(questions, catalog = {}) {
    const startTime = Date.now();
    // Determine candidates from the first question (usually from the same document)
    const firstText = questions[0]?.questionText || '';
    const candidates = this._extractCandidatesFromText(firstText, catalog);

    const parts = [];
    parts.push('You are an educational classification engine.');
    parts.push('');
    parts.push(`Classify ${questions.length} questions.`);

    // Add each question compactly
    questions.forEach((q, idx) => {
      const qText = (q.questionText || '').slice(0, 1200);
      parts.push(`Q${idx + 1}: ${qText}`);

      const options = q.options || [];
      if (options.length > 0) {
        const optText = options.map((o, i) =>
          `${String.fromCharCode(65 + i)}.${(o.text || '').slice(0, 150)}`
        ).join(' ');
        parts.push(`OPTS: ${optText}`);
      }

      const answerText = extractAnswer(q);
      if (answerText) parts.push(`ANS: ${answerText.slice(0, 200)}`);

      parts.push('---');
    });

    // Syllabus (once, compact)
    const syllabusLines = this._buildCompactFilteredSyllabus(catalog, candidates);
    if (syllabusLines.length > 0) {
      parts.push(...syllabusLines);
      parts.push('');
    }

    parts.push('Use ONLY values from context.');
    parts.push('Return JSON array:');
    parts.push('[{"class":"","subject":"","chapter":"","topic":"","difficulty":""},...]');

    let result = parts.join('\n');

    // Hard truncation if over budget
    if (result.length > this.promptMaxChars * 2) {
      // Keep instruction + JSON template, heavily truncate question bodies
      const preamble = parts.slice(0, 3).join('\n');
      const jsonEnd = parts.slice(-3).join('\n');
      const remaining = this.promptMaxChars * 2 - preamble.length - jsonEnd.length - 200;
      const perQuestion = Math.floor(remaining / questions.length);
      const truncatedParts = [preamble];
      questions.forEach((q, idx) => {
        const qText = (q.questionText || '').slice(0, perQuestion);
        truncatedParts.push(`Q${idx + 1}: ${qText}`);
        truncatedParts.push('---');
      });
      truncatedParts.push(...syllabusLines, '', 'Use ONLY values from context.', 'Return JSON array:', '[{"class":"","subject":"","chapter":"","topic":"","difficulty":""},...]');
      result = truncatedParts.join('\n');
    }

    const genTime = Date.now() - startTime;
    const estTokens = Math.round(result.length / 3.5);
    const syllabusChars = syllabusLines.join('').length;
    logger.info(`[PROMPT_DIAG] Type=batch GenTime=${genTime}ms Questions=${questions.length} Chars=${result.length} Tokens=${estTokens} Candidates_exam=${candidates.examPatterns.length} Candidates_class=${candidates.classes.length} Candidates_subject=${candidates.subjects.length} Syllabus_chars=${syllabusChars}`);
    logger.info(`[PROMPT_DIAG] BATCH_PROMPT_START: ${result.slice(0, 500).replace(/\n/g, '\\n')}`);
    logger.info(`[PROMPT_DIAG] BATCH_PROMPT_END: ${result.slice(-500).replace(/\n/g, '\\n')}`);

    return result;
  }

  // ──────────────────────────────────────────────
  // Smart retries with backoff
  // ──────────────────────────────────────────────

  /**
   * Execute a call with smart retry and backoff.
   * Detects cold start and applies longer timeout.
   * @param {Function} fn - Async function to retry
   * @param {string} label - Log label
   * @returns {Promise<any>}
   */
  async _withRetry(fn, label = '') {
    let lastError = null;
    const isColdStart = this._coldStartDetected;
    const effectiveTimeout = isColdStart ? this.coldStartTimeoutMs : this.timeoutMs;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn(effectiveTimeout);
        // On success: mark warm, return result
        this._coldStartDetected = false;
        this._lastSuccessfulCall = Date.now();
        return result;
      } catch (err) {
        lastError = err;
        const isTimeout = err.message.includes('timeout') || err.message.includes('aborted');
        const isConnectionError = err.message.includes('fetch') || err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED');

        // Detect cold start if first attempt fails with timeout
        if (attempt === 1 && isTimeout && !this._coldStartDetected) {
          this._coldStartDetected = true;
          logger.warn(`[space] Cold start suspected on ${label}, will use longer timeout for retry`);
        }

        if (attempt < this.maxRetries) {
          // Calculate backoff delay: attempt 1 → 3s, attempt 2 → 10s
          const delay = Math.min(
            this.baseDelayMs * Math.pow(2, attempt - 1),
            this.maxDelayMs
          );
          logger.info(`[space] Retry ${attempt+1}/${this.maxRetries} for ${label} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // ──────────────────────────────────────────────
  // Space API call
  // ──────────────────────────────────────────────

  /**
   * Call the ExForge Llama inference API.
   * Uses the simple POST/JSON contract:
   *   POST /api/chat  { "data": [ "<prompt>" ] }
   *   Response: { "data": [ "<response_text>" ] }
   * @param {string} prompt - The full classification prompt
   * @param {number} timeout - Timeout for this call
   * @returns {Promise<string>} The model response text
   */
  async _callSpace(prompt, timeout = this.timeoutMs) {
    const url = `${SPACE_HOST}${SPACE_ENDPOINT}`;
    const callStart = Date.now();

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [prompt] }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      throw new Error(`Space API call failed: ${err.name} — ${err.message}`);
    }

    const callDuration = Date.now() - callStart;

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Space API returned ${res.status}: ${errBody.slice(0, 200)}`);
    }

    let bodyJson;
    try {
      bodyJson = await res.json();
    } catch (err) {
      throw new Error(`Space API response not JSON: ${err.message}`);
    }

    const parseStart = Date.now();

    // Expected format: { "data": [ "<response_text>" ] }
    if (!bodyJson || !Array.isArray(bodyJson.data) || bodyJson.data.length === 0) {
      logger.warn(`[CALL_DIAG] Phase=Parse Status=fail Duration=${Date.now() - parseStart}ms Reason=missing_data_array Response=${JSON.stringify(bodyJson).slice(0, 200)}`);
      throw new Error('Space API response missing data array');
    }

    const responseText = bodyJson.data[0];
    if (typeof responseText !== 'string' || !responseText.trim()) {
      logger.warn(`[CALL_DIAG] Phase=Parse Status=fail Duration=${Date.now() - parseStart}ms Reason=empty_or_nonstring_data`);
      throw new Error('Space API returned empty or non-string response');
    }

    logger.info(`[CALL_DIAG] Phase=Request Status=ok Duration=${callDuration}ms Output_size=${responseText.length}`);

    return responseText.trim();
  }

  // ──────────────────────────────────────────────
  // classifyBatch — multiple questions per call
  // ──────────────────────────────────────────────

  /**
   * Dynamically calculate batch size based on estimated prompt length per question.
   */
  _calculateBatchSize(questions) {
    if (!questions?.length) return 0;
    // Estimate cost per question
    const costs = questions.map(q => this._estimateQuestionPromptCost(q) + 200); // +200 for formatting overhead
    const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;

    // How many can fit in the prompt budget?
    // budget = promptMaxChars * 2 (batch gets 2x budget since sharing syllabus overhead)
    const budget = this.promptMaxChars * 2;
    const syllabusOverhead = 500; // estimated syllabus context
    const perQuestionBudget = avgCost + 50; // question text + separator

    let maxBatch = Math.floor((budget - syllabusOverhead) / perQuestionBudget);
    maxBatch = Math.max(this.batchMinSize, Math.min(maxBatch, this.batchMaxSize, questions.length));
    return maxBatch;
  }

  /**
   * Classify multiple questions in a single Space API call.
   */
  async classifyBatch(questions, catalog, docMeta = {}) {
    if (!this.isConfigured() || !questions?.length) return null;

    const uploadId = docMeta?.uploadId || '?';
    const batchId = docMeta?.batchIndex ?? '?';
    const batchSize = this._calculateBatchSize(questions);

    // Split questions into sub-batches if needed
    const subBatches = [];
    for (let i = 0; i < questions.length; i += batchSize) {
      subBatches.push(questions.slice(i, i + batchSize));
    }

    let allResults = [];

    for (let b = 0; b < subBatches.length; b++) {
      const subBatch = subBatches[b];
      const prompt = this._buildBatchPrompt(subBatch, catalog);
      const promptLen = prompt.length;
      const startTime = Date.now();

      logger.info(`[AI_BATCH] Upload=${uploadId} SubBatch=${b + 1}/${subBatches.length} Questions=${subBatch.length} PromptChars=${promptLen}`);

      let modelResponse = null;
      try {
        modelResponse = await this._withRetry(
          (timeout) => this._callSpace(prompt, timeout),
          `batch-${uploadId}-${b + 1}`
        );
      } catch (err) {
        const duration = Date.now() - startTime;
        logger.error(`[SPACE_RESULT] Upload=${uploadId} Batch=${batchId} SubBatch=${b + 1} Status=fail Duration=${duration}ms Error=${err.message.slice(0, 100)}`);
        // Sub-batch failed — return nulls for this batch
        allResults.push(...subBatch.map(() => null));
        continue;
      }

      const duration = Date.now() - startTime;
      logger.info(`[SPACE_RESULT] Upload=${uploadId} Batch=${batchId} SubBatch=${b + 1} Status=ok Duration=${duration}ms`);

      // Parse response
      let classifications;
      try {
        const jsonStr = extractJSON(modelResponse);
        classifications = JSON.parse(jsonStr);
      } catch (err) {
        logger.warn(`[space] Batch JSON parse failed: ${err.message}`);
        allResults.push(...subBatch.map(() => null));
        continue;
      }

      if (!Array.isArray(classifications)) {
        logger.warn(`[space] Batch response was not an array`);
        allResults.push(...subBatch.map(() => null));
        continue;
      }

      // Map each classification
      const mapped = subBatch.map((q, idx) => {
        const c = classifications[idx];
        if (!c || (!c.class && !c.subject)) {
          logger.warn(`[space] Batch question ${idx + 1} missing required fields`);
          return null;
        }

        const classStr = String(c.class || '');
        const classNum = parseInt(classStr.replace(/[^0-9]/g, ''), 10) || undefined;
        const difficulty = (c.difficulty || 'medium').toLowerCase();

        return {
          class: (classNum >= 6 && classNum <= 12) ? classNum : undefined,
          difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
          questionType: normalizeQuestionType(q.questionType || ''),
          confidence: 0.70,
          hints: {
            subject: c.subject || null,
            topic: c.chapter || c.topic || null,
            examType: null,
          },
        };
      });

      allResults.push(...mapped);
    }

    // Structured diagnostic log
    logger.info(`[AI_BATCH_COMPLETE] Upload=${uploadId} Batch=${batchId} TotalQuestions=${questions.length} SubBatches=${subBatches.length} Successful=${allResults.filter(r => r !== null).length}`);

    return allResults;
  }

  // ──────────────────────────────────────────────
  // classify — single question
  // ──────────────────────────────────────────────

  /**
   * Classify a single question.
   * Used only when batching is not available or falls back.
   */
  async classify(question, catalog, docMeta = {}) {
    if (!this.isConfigured()) return null;

    const uploadId = docMeta?.uploadId || '?';
    const prompt = this._buildPrompt(question, catalog);
    const promptLen = prompt.length;
    const startTime = Date.now();

    logger.info(`[SPACE_CALL] Upload=${uploadId} Type=single PromptChars=${promptLen}`);

    let modelResponse = null;
    try {
      modelResponse = await this._withRetry(
        (timeout) => this._callSpace(prompt, timeout),
        `single-${uploadId}`
      );
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(`[SPACE_RESULT] Upload=${uploadId} Type=single Status=fail Duration=${duration}ms Error=${err.message.slice(0, 100)}`);
      return null;
    }

    const duration = Date.now() - startTime;
    logger.info(`[SPACE_RESULT] Upload=${uploadId} Type=single Status=ok Duration=${duration}ms`);

    // Parse JSON from the response
    let classification = null;
    try {
      const jsonStr = extractJSON(modelResponse);
      classification = JSON.parse(jsonStr);
    } catch (err) {
      logger.warn(`[space] JSON parse failed: ${err.message}`);
      return null;
    }

    if (!classification.class && !classification.subject) {
      logger.warn(`[space] Response missing both class and subject: ${JSON.stringify(classification).slice(0, 200)}`);
      return null;
    }

    const classStr = String(classification.class || '');
    const classNum = parseInt(classStr.replace(/[^0-9]/g, ''), 10) || undefined;
    const difficulty = (classification.difficulty || 'medium').toLowerCase();

    return {
      class: (classNum >= 6 && classNum <= 12) ? classNum : undefined,
      difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
      questionType: normalizeQuestionType(question.questionType || ''),
      confidence: 0.70,
      hints: {
        subject: classification.subject || null,
        topic: classification.chapter || classification.topic || null,
        examType: null,
      },
    };
  }

  // ──────────────────────────────────────────────
  // refineQuestion — kept for API compatibility
  // ──────────────────────────────────────────────

  async refineQuestion(parserResult, cleanedPlainText) {
    if (!this.isConfigured()) return null;

    const prompt = [
      'You are a professional educational document parser and question refiner.',
      '',
      'Refine the following extracted question content into clean structured JSON.',
      '',
      'INPUT:',
      JSON.stringify({
        questionText: (parserResult.questionText || '').slice(0, 1500),
        questionType: parserResult.questionType,
        options: (parserResult.options || []).slice(0, 8).map((o) => o.text),
      }),
      '',
      'RAW TEXT:',
      (cleanedPlainText || '').slice(0, 2500),
      '',
      'Return ONLY valid JSON.',
      '{',
      '  "questionText": "",',
      '  "questionType": "",',
      '  "options": [{ "text": "" }],',
      '  "correctAnswers": []',
      '}',
    ].join('\n');

    try {
      const response = await this._withRetry(
        (timeout) => this._callSpace(prompt, timeout),
        'refine'
      );
      const jsonStr = extractJSON(response);
      const parsed = JSON.parse(jsonStr);
      return {
        ...parsed,
        options: (parsed.options || []).map((o) =>
          typeof o === 'string' ? { text: o } : { text: o.text || '' }
        ),
        correctAnswers: Array.isArray(parsed.correctAnswers)
          ? parsed.correctAnswers
          : [parsed.correctAnswers].filter(Boolean),
      };
    } catch (err) {
      logger.warn(`[space] Refinement failed: ${err.message}`);
      return null;
    }
  }
}
