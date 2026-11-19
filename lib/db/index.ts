import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Reuse one postgres.js pool across hot reloads in development so we do not
 * exhaust connections. In production a single module instance is fine.
 */
const globalForDb = globalThis as unknown as {
  queryClient?: postgres.Sql;
};

const queryClient =
  globalForDb.queryClient ??
  postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.queryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;
export { queryClient };
