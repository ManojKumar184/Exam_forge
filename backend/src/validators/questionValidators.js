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
  exam_type_id: z.string().optional().nullable(),
  options: z.array(optionSchema).optional(),
  correct_option: z.number().int().min(0).max(3).optional().nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  marks: z.number().positive().optional(),
  explanation: z.string().optional().nullable(),
  question_latex: z.string().optional().nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'needs_review']).optional(),
});

export const updateQuestionSchema = createQuestionSchema.partial();

export const listQuestionsSchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'needs_review']).optional(),
  subject_id: z.string().optional(),
  chapter_id: z.string().optional(),
  exam_type_id: z.string().optional(),
  class: z.coerce.number().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  question_type: z.enum(['mcq', 'descriptive', 'numerical']).optional(),
  source: z.string().optional(),
  upload_id: z.string().optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

export const bulkIdsSchema = z.object({
  ids: z.array(z.string()).min(1),
  notes: z.string().optional(),
});
