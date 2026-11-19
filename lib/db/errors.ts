import { PostgresError } from "postgres";

/** True for a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof PostgresError && error.code === "23505";
}

/** True for a Postgres foreign-key violation (SQLSTATE 23503). */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof PostgresError && error.code === "23503";
}
