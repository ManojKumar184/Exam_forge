import { z } from 'zod';

export const createTestSchema = z.object({
  paper_id: z.string(),
  test_code: z.string().min(3),
  start_time: z.string().datetime().nullable().optional(),
  end_time: z.string().datetime().nullable().optional(),
  duration_minutes: z.coerce.number().positive().optional(),
  max_attempts: z.coerce.number().int().positive().optional(),
  shuffle_questions: z.boolean().optional(),
  shuffle_options: z.boolean().optional(),
  show_results: z.boolean().optional(),
  show_answers: z.boolean().optional(),
  allow_review: z.boolean().optional(),
  is_public: z.boolean().optional(),
  access_code: z.string().nullable().optional(),
  allowed_users: z.array(z.string()).optional(),
  status: z.enum(['draft', 'scheduled', 'active', 'completed', 'archived']).optional(),
});

export const updateTestSchema = createTestSchema.partial();

export const autosaveSchema = z.object({
  time_spent_seconds: z.coerce.number().nonnegative().optional(),
  answers: z
    .array(
      z.object({
        question_id: z.string(),
        selected_option: z.number().nullable().optional(),
        numerical_answer: z.number().nullable().optional(),
        text_answer: z.string().nullable().optional(),
        is_marked_for_review: z.boolean().optional(),
        time_spent_seconds: z.coerce.number().nonnegative().optional(),
      })
    )
    .optional(),
});

