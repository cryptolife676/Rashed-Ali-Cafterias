import { z } from 'zod';

/**
 * Minimum 8 characters with at least one letter and one digit. Supabase's
 * own default floor is 6, which is too low for an account that can read
 * every shareholder's financial position.
 */
export const Password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Too long')
  .refine((v) => /[A-Za-z]/.test(v), 'Include at least one letter')
  .refine((v) => /\d/.test(v), 'Include at least one number');

export const ChangeOwnPasswordInput = z
  .object({
    // Absent only when the account has no password yet (Google sign-in).
    current_password: z.string().max(128).optional().nullable(),
    new_password: Password,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: 'The two new passwords do not match',
    path: ['confirm_password'],
  })
  .refine((v) => v.current_password !== v.new_password, {
    message: 'The new password must differ from the current one',
    path: ['new_password'],
  });

export const SetUserPasswordInput = z
  .object({
    user_id: z.string().uuid('Pick a user'),
    new_password: Password,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: 'The two passwords do not match',
    path: ['confirm_password'],
  });
