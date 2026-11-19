import { z } from "zod";

/**
 * ENCRYPTION_KEY must decode to exactly 32 bytes (256 bits) from base64.
 * Used by lib/crypto.ts to encrypt integration_config values at rest.
 */
const encryptionKey = z.string().refine(
  (value) => {
    try {
      return Buffer.from(value, "base64").length === 32;
    } catch {
      return false;
    }
  },
  { message: "ENCRYPTION_KEY must be a 32-byte value encoded as base64" },
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Core
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().default("http://localhost:3000"),
  ENCRYPTION_KEY: encryptionKey,

  // Ploi
  PLOI_API_TOKEN: z.string().optional(),
  PLOI_API_BASE: z.string().default("https://ploi.io/api"),

  // Lighthouse webhook
  LIGHTHOUSE_WEBHOOK_SECRET: z.string().optional(),

  // Alert delivery
  SLACK_WEBHOOK_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // Worker
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10000),

  // Local development
  USE_MOCKS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  // Fail fast: never start with an invalid environment.
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
