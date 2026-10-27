import { z } from 'zod';
import { USER_ROLES } from '../models/User.js';

const email = z.string().trim().toLowerCase().email('Invalid email address').max(254);

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one number');

const token = z.string().trim().length(64, 'Invalid token');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be at most 80 characters'),
  email,
  password,
  role: z.enum(USER_ROLES).default('owner'),
}).strict();

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
}).strict();

export const forgotPasswordSchema = z.object({ email }).strict();

export const resetPasswordSchema = z.object({ token, password }).strict();

export const verifyEmailSchema = z.object({ token }).strict();

export const changePasswordSchema = z.object({ currentPassword: z.string().max(128).optional(), newPassword: password }).strict();
export const googleSchema = z.object({ credential: z.string().min(20).max(4096), intent: z.enum(['login', 'register']).default('login') }).strict();
export const otpRequestSchema = z.object({ email }).strict();
export const otpVerifySchema = z.object({ email, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }).strict();
