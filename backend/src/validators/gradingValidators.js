import { z } from 'zod';

export const gradeAttemptSchema = z.object({
  grades: z
    .array(
      z.object({
        answer_id: z.string().min(1),
        marks: z.coerce.number().min(0),
        remarks: z.string().max(2000).optional().nullable(),
      })
    )
    .min(1),
});
