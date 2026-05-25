import { z } from 'zod';

const sectionSchema = z.object({
  name: z.string().min(1),
  questionCount: z.number().int().nonnegative(),
  marksPerQuestion: z.number().nonnegative(),
});

const paperQuestionSchema = z.object({
  question_id: z.string(),
  section: z.string(),
  section_order: z.number().int().optional(),
  question_order: z.number().int().optional(),
  custom_marks: z.number().nullable().optional(),
});

export const createPaperSchema = z.object({
  title: z.string().min(2),
  description: z.string().nullable().optional(),
  exam_type_id: z.string().nullable().optional(),
  subject_id: z.string().nullable().optional(),
  class: z.coerce.number().int().min(6).max(12),
  total_marks: z.coerce.number().nonnegative(),
  total_questions: z.coerce.number().int().nonnegative(),
  duration_minutes: z.coerce.number().positive(),
  sections: z.array(sectionSchema).optional(),
  instructions: z.string().nullable().optional(),
  paper_set: z.enum(['A', 'B', 'C', 'D']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  questions: z.array(paperQuestionSchema).optional(),
});

export const updatePaperSchema = createPaperSchema.partial();

const sectionSpecSchema = sectionSchema.extend({
  id: z.string().optional(),
  question_types: z.array(z.enum(['mcq', 'descriptive', 'numerical'])).optional(),
  question_type: z.enum(['mcq', 'descriptive', 'numerical']).optional(),
  difficulty_distribution: z
    .object({
      easy: z.coerce.number().nonnegative().optional(),
      medium: z.coerce.number().nonnegative().optional(),
      hard: z.coerce.number().nonnegative().optional(),
    })
    .optional(),
});

export const generatePaperSchema = z.object({
  title: z.string().min(2),
  exam_type_id: z.string().nullable().optional(),
  subject_id: z.string().nullable().optional(),
  class: z.coerce.number().int().min(6).max(12),
  total_questions: z.coerce.number().int().positive().optional(),
  total_marks: z.coerce.number().nonnegative().optional(),
  duration_minutes: z.coerce.number().positive().optional(),
  difficulty_distribution: z
    .object({
      easy: z.coerce.number().nonnegative().optional(),
      medium: z.coerce.number().nonnegative().optional(),
      hard: z.coerce.number().nonnegative().optional(),
    })
    .optional(),
  sections: z.array(sectionSpecSchema).optional(),
  status: z.enum(['draft', 'published']).optional(),
});

export const poolFilterSchema = z.object({
  subject_id: z.string().optional(),
  subject_ids: z.union([z.string(), z.array(z.string())]).optional(),
  exam_type_id: z.string().nullable().optional(),
  exam_type_ids: z.union([z.string(), z.array(z.string())]).optional(),
  class: z.coerce.number().int().min(6).max(12).optional(),
  classes: z.union([z.string(), z.array(z.coerce.number())]).optional(),
  chapter_ids: z.union([z.string(), z.array(z.string())]).optional(),
  difficulties: z.union([z.string(), z.array(z.string())]).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  question_types: z.union([z.string(), z.array(z.string())]).optional(),
});

export const selectQuestionsSchema = poolFilterSchema.extend({
  subject_id: z.string().min(1),
  class: z.coerce.number().int().min(6).max(12).optional(),
  total_questions: z.coerce.number().int().nonnegative().optional(),
  total_marks: z.coerce.number().nonnegative().optional(),
  chapter_ids: z.array(z.string()).optional(),
  exclude_question_ids: z.array(z.string()).optional(),
  difficulty_distribution: z
    .object({
      easy: z.coerce.number().nonnegative().optional(),
      medium: z.coerce.number().nonnegative().optional(),
      hard: z.coerce.number().nonnegative().optional(),
    })
    .optional(),
  sections: z.array(sectionSpecSchema).min(1),
});

