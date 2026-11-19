import type { JobHandler, JobType } from "../types";
import { syncServersHandler } from "./sync-servers";

/**
 * Registered job handlers, keyed by `jobs.type`. A job whose type has no
 * handler is marked failed rather than silently ignored.
 */
export const jobHandlers: Partial<Record<JobType, JobHandler>> = {
  sync_servers: syncServersHandler,
};
