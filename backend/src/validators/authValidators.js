import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2).max(120),
  role: z.enum(['faculty', 'student']),
  schoolInstitute: z.string().max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  school_institute: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  avatar_url: z.string().url().optional().nullable(),
});
