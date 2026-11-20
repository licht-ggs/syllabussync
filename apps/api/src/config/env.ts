import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: "../../.env" });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    SUPABASE_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    SUPABASE_PUBLISHABLE_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
  })
  .superRefine((env, context) => {
    if (Boolean(env.SUPABASE_URL) !== Boolean(env.SUPABASE_PUBLISHABLE_KEY)) {
      context.addIssue({
        code: "custom",
        message:
          "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together",
      });
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  throw new Error(`Invalid environment configuration: ${result.error.message}`);
}

export const env = result.data;
