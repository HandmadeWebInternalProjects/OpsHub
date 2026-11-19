import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

/**
 * Sensitive keys are redacted everywhere they appear in a log object.
 * Keep this list aligned with AGENTS.md "Security".
 */
const REDACT_PATHS = [
  "password",
  "passwordHash",
  "password_hash",
  "token",
  "apiToken",
  "api_token",
  "secret",
  "authorization",
  "encryptedValue",
  "encrypted_value",
  "encryptionKey",
  "*.password",
  "*.passwordHash",
  "*.password_hash",
  "*.token",
  "*.apiToken",
  "*.api_token",
  "*.secret",
  "*.authorization",
  "*.encryptedValue",
  "*.encrypted_value",
  "*.*.password",
  "*.*.token",
  "*.*.secret",
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  enabled: !isTest,
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
      },
});

const SENSITIVE_KEY =
  /(pass(word)?|secret|token|api[_-]?key|authorization|encryption[_-]?key|private[_-]?key|credential)/i;
const REDACTED = "[REDACTED]";

/**
 * Deeply redact values whose keys look sensitive. Use this before logging or
 * persisting any object that may contain secrets or decrypted config.
 */
function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(item, seen);
  }
  return result;
}

export function redact<T>(value: T): T {
  return redactValue(value, new WeakSet<object>()) as T;
}
