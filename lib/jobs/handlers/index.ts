import type { JobHandler, JobType } from "../types";
import { provisionSiteHandler } from "./provision-site";
import { syncServersHandler } from "./sync-servers";

/**
 * Registered job handlers, keyed by `jobs.type`. A job whose type has no
 * handler is marked failed rather than silently ignored.
 */
export const jobHandlers: Partial<Record<JobType, JobHandler>> = {
  sync_servers: syncServersHandler,
  provision_site: provisionSiteHandler,
};
