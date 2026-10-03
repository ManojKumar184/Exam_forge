import { z } from 'zod';

export const OBJECTIVE_QUESTION_TYPES = Object.freeze([
  'MCQ_SINGLE', 'MCQ_MULTIPLE', 'TRUE_FALSE', 'FILL_BLANK', 'NUMERICAL',
  'NUMERICAL_INTEGER', 'MATCH_FOLLOWING', 'ASSERTION_REASON', 'UNCLASSIFIED',
]);

const evidenceBlockSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  type: z.string().min(1),
  text: z.string().optional(),
  html: z.string().nullable().optional(),
  page: z.number().int().positive().nullable().optional(),
  section: z.string().optional(),
  numbering: z.unknown().nullable().optional(),
  style: z.string().nullable().optional(),
  table: z.unknown().nullable().optional(),
  contentBlocks: z.array(z.unknown()).optional(),
  images: z.array(z.unknown()).optional(),
  equations: z.array(z.unknown()).optional(),
  captions: z.array(z.unknown()).optional(),
  raw: z.unknown().nullable().optional(),
}).passthrough();

export const rawDocumentIRSchema = z.object({
  version: z.literal('semantic-document/v1'),
  sourceType: z.enum(['docx', 'native_pdf', 'scanned_pdf', 'image', 'clipboard', 'html']),
  sourceFile: z.string().nullable(),
  metadata: z.record(z.unknown()),
  blocks: z.array(evidenceBlockSchema),
}).superRefine((document, ctx) => {
  const ids = new Set();
  document.blocks.forEach((block, index) => {
    if (ids.has(block.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index, 'id'], message: 'Evidence block IDs must be unique' });
    ids.add(block.id);
  });
});

const normalizedBlockSchema = z.object({
  type: z.enum(['text', 'equation', 'image', 'table', 'embedded']),
  sourceBlockIds: z.array(z.string().min(1)).optional(),
}).passthrough();

const normalizedOptionSchema = z.object({
  label: z.string().optional(),
  content: z.array(normalizedBlockSchema).optional(),
  text: z.string().optional(),
}).passthrough();

export const normalizedQuestionIRSchema = z.object({
  sourceEvidence: z.array(z.string().min(1)).min(1),
  questionNumber: z.union([z.string(), z.number()]).nullable().optional(),
  type: z.enum(OBJECTIVE_QUESTION_TYPES),
  content: z.object({ blocks: z.array(normalizedBlockSchema).min(1) }).passthrough(),
  options: z.array(normalizedOptionSchema).optional(),
  answer: z.unknown().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.enum(['pending', 'needs_review']).optional(),
}).passthrough();

export const normalizedQuestionBatchSchema = z.object({
  questions: z.array(normalizedQuestionIRSchema),
});

export function validateRawDocumentIR(input) {
  return rawDocumentIRSchema.safeParse(input);
}

export function validateNormalizedQuestionBatch(input, rawDocument) {
  const parsed = normalizedQuestionBatchSchema.safeParse(input);
  if (!parsed.success) return parsed;
  const available = new Set((rawDocument?.blocks || []).map((block) => block.id));
  const issues = [];
  parsed.data.questions.forEach((question, questionIndex) => {
    for (const id of question.sourceEvidence) {
      if (!available.has(id)) issues.push({ code: z.ZodIssueCode.custom, path: ['questions', questionIndex, 'sourceEvidence'], message: `Unknown source evidence ID: ${id}` });
    }
    if (question.type === 'UNCLASSIFIED' && question.status !== 'needs_review') {
      issues.push({ code: z.ZodIssueCode.custom, path: ['questions', questionIndex, 'status'], message: 'UNCLASSIFIED questions must remain needs_review' });
    }
    if (question.type === 'MCQ_SINGLE' && (question.options?.length || 0) < 2) {
      issues.push({ code: z.ZodIssueCode.custom, path: ['questions', questionIndex, 'options'], message: 'MCQ_SINGLE requires at least two options' });
    }
    if (question.type === 'MCQ_MULTIPLE' && (question.options?.length || 0) < 2) {
      issues.push({ code: z.ZodIssueCode.custom, path: ['questions', questionIndex, 'options'], message: 'MCQ_MULTIPLE requires at least two options' });
    }
  });
  if (issues.length) return { success: false, error: new z.ZodError(issues) };
  return parsed;
}
