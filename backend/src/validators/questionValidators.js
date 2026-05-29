import { z } from 'zod';

const optionSchema = z.object({
  text: z.string().optional(),
  image: z.string().nullable().optional(),
  latex: z.string().nullable().optional(),
});

export const createQuestionSchema = z.object({
  question_text: z.string().min(5),
  question_type: z.enum(['mcq', 'descriptive', 'numerical']),
  class: z.number().int().min(6).max(12),
  subject_id: z.string().optional().nullable(),
  chapter_id: z.string().optional().nullable(),
  chapter_name: z.string().optional().nullable(),
  exam_type_id: z.string().optional().nullable(),
  options: z.array(optionSchema).optional(),
  correct_option: z.number().int().min(0).max(7).optional().nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  marks: z.number().positive().optional(),
  explanation: z.string().optional().nullable(),
  question_latex: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'needs_review']).optional(),
  parser_confidence: z.number().optional(),
  reconstruction_fidelity: z.number().optional(),
  semantic_confidence: z.number().optional(),
  math_preservation_confidence: z.number().optional(),
  metadata_confidence: z.number().optional(),
  audit_history: z.array(z.any()).optional(),
});

export const updateQuestionSchema = createQuestionSchema.partial();

export const reconstructQuestionSchema = z.object({
  html: z.string().max(10_000_000).optional(),
  plain: z.string().max(5_000_000).optional(),
  rawHtml: z.string().max(10_000_000).optional(),
  ocrText: z.string().max(5_000_000).optional(),
  images: z.array(z.string().max(10_000_000)).max(20).optional(),
  useGemini: z.boolean().optional(),
  blocks: z.array(z.any()).optional(),
});

export const semanticQuestionSchema = z.object({
  questionType: z.string().optional().default("DESCRIPTIVE"),
  stem: z.string().optional().default(""),
  options: z.array(
    z.union([
      z.string(),
      z.object({
        text: z.string().optional().default(""),
        latex: z.string().nullable().optional(),
        image: z.string().nullable().optional()
      })
    ])
  ).optional().default([]),
  correctAnswers: z.union([z.string(), z.array(z.string())]).optional().default([]),
  explanation: z.string().optional().default(""),
  statementGroups: z.array(z.string()).optional().default([]),
  formulas: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
});

export const reconstructionResponsePayloadSchema = z.object({
  questionText: z.string().default(''),
  questionHtml: z.string().nullable().optional(),
  questionLatex: z.string().nullable().optional(),
  questionType: z.string().default('descriptive'),
  subtype: z.string().default('descriptive'),
  options: z.array(z.object({
    text: z.string().default(''),
    latex: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
  })).default([]),
  tags: z.array(z.string()).default([]),
  questionImages: z.array(z.string()).default([]),
  numericalAnswer: z.number().nullable().optional(),
  correctOption: z.number().nullable().optional(),
  warnings: z.array(z.string()).default([]),
  sources: z.object({
    parser: z.boolean().default(true),
    ocr: z.boolean().default(false),
    gemini: z.boolean().default(false),
    ollama: z.boolean().optional(),
  }),
  hasEquation: z.boolean().default(false),
  correctAnswers: z.array(z.string()).default([]),
  figures: z.array(z.any()).default([]),
  formulas: z.array(z.string()).default([]),
  semanticBlocks: z.array(z.any()).default([]),
  statementGroups: z.array(z.string()).default([]),
  comprehensionLinks: z.array(z.any()).default([]),
  parserConfidence: z.number().default(1.0),
  reconstructionFidelity: z.number().default(0.8),
  semanticConfidence: z.number().default(1.0),
  mathPreservationConfidence: z.number().default(1.0),
  metadataConfidence: z.number().default(1.0),
  raw_stem: z.string().default(''),
  raw_options: z.array(z.object({
    text: z.string().default(''),
    latex: z.string().nullable().optional(),
  })).default([]),
  layout_blocks: z.array(z.any()).default([]),
  parser_confidence: z.number().default(1.0),
  reconstruction_fidelity: z.number().default(0.8),
  semantic_confidence: z.number().default(1.0),
  math_preservation_confidence: z.number().default(1.0),
  metadata_confidence: z.number().default(1.0),
  audit_history: z.array(z.any()).default([]),
  ocr_confidence: z.number().nullable().optional(),
  debugInfo: z.any().nullable().optional(),
});

export const listQuestionsSchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'needs_review']).optional(),
  subject_id: z.string().optional(),
  subject_ids: z.union([z.string(), z.array(z.string())]).optional(),
  chapter_id: z.string().optional(),
  chapter_ids: z.union([z.string(), z.array(z.string())]).optional(),
  exam_type_id: z.string().optional(),
  exam_type_ids: z.union([z.string(), z.array(z.string())]).optional(),
  class: z.coerce.number().optional(),
  classes: z.union([z.string(), z.array(z.coerce.number())]).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  difficulties: z.union([z.string(), z.array(z.string())]).optional(),
  question_type: z.enum(['mcq', 'descriptive', 'numerical']).optional(),
  question_types: z.union([z.string(), z.array(z.string())]).optional(),
  source: z.string().optional(),
  upload_id: z.string().optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

export const bulkUpdateMetadataSchema = z.object({
  ids: z.array(z.string()).min(1),
  updates: z.object({
    class: z.coerce.number().int().min(6).max(12).optional(),
    subject_id: z.string().nullable().optional(),
    chapter_id: z.string().nullable().optional(),
    exam_type_id: z.string().nullable().optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(['pending', 'approved', 'rejected', 'needs_review']).optional(),
  }),
});

export const bulkIdsSchema = z.object({
  ids: z.array(z.string()).min(1),
  notes: z.string().optional(),
});
