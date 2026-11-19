import { jobType } from "@/lib/db/schema";
import type { Job } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

/** Every value allowed in the `jobs.type` enum (PROJECT.md §4). */
export type JobType = (typeof jobType.enumValues)[number];

export type JobLogger = typeof logger;

export type JobContext = {
  job: Job;
  logger: JobLogger;
};

export type JobHandlerResult = {
  /** Short human-readable outcome, stored for observability. */
  summary: string;
  data?: Record<string, unknown>;
};

export type JobHandler = (context: JobContext) => Promise<JobHandlerResult>;
