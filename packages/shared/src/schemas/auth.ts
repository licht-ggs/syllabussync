import { z } from "zod";

const emailSchema = z.string().trim().email("Enter a valid email address.");
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be 128 characters or fewer.");

export const signUpSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Enter your preferred name.")
      .max(80, "Name must be 80 characters or fewer."),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const profileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().min(1).max(80),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
