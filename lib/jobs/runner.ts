import { and, asc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import type { Job } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logger, redact } from "@/lib/logger";

import { enqueueJob } from "./enqueue";
import { jobHandlers } from "./handlers";
import type { JobType } from "./types";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 30_000;
const RECURRING_SYNC_INTERVAL_MS = 5 * 60_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Atomically claim the oldest due job. `FOR UPDATE SKIP LOCKED` lets several
 * workers run safely without two of them taking the same row.
 */
export async function claimNextJob(): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(jobs)
      .where(
        and(eq(jobs.status, "pending"), lte(jobs.scheduledFor, new Date())),
      )
      .orderBy(asc(jobs.scheduledFor))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) return null;

    const [updated] = await tx
      .update(jobs)
      .set({
        status: "running",
        startedAt: new Date(),
        attempts: candidate.attempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, candidate.id))
      .returning();

    return updated ?? null;
  });
}

async function markSucceeded(job: Job): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: "succeeded",
      finishedAt: new Date(),
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));
}

async function markFailed(job: Job, message: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: "failed",
      error: message,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));
  logger.error({ jobId: job.id, type: job.type, error: message }, "job failed");
}

async function reschedule(job: Job, message: string): Promise<void> {
  const backoffMs = RETRY_BASE_MS * 2 ** Math.max(job.attempts - 1, 0);
  await db
    .update(jobs)
    .set({
      status: "pending",
      error: message,
      scheduledFor: new Date(Date.now() + backoffMs),
      startedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));
  logger.warn(
    {
      jobId: job.id,
      type: job.type,
      attempts: job.attempts,
      backoffMs,
      error: message,
    },
    "job failed; will retry",
  );
}

/** Run a single already-claimed job to completion (success / retry / fail). */
export async function runJob(job: Job): Promise<void> {
  const handler = jobHandlers[job.type];
  if (!handler) {
    await markFailed(job, `No handler registered for job type "${job.type}".`);
    return;
  }

  try {
    const result = await handler({ job, logger });
    await markSucceeded(job);
    logger.info(
      { jobId: job.id, type: job.type, summary: result.summary },
      "job succeeded",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job.attempts < MAX_ATTEMPTS) {
      await reschedule(job, message);
    } else {
      await markFailed(job, message);
    }
  }
}

/** Claim and run at most one due job. Returns true if a job was processed. */
export async function processNextJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;
  await runJob(job);
  return true;
}

/**
 * Enqueue a recurring job of `type` when none has been created in the last
 * `intervalMs`, so the interval survives worker restarts and multiple workers.
 */
export async function enqueueIfStale(
  type: JobType,
  intervalMs: number,
): Promise<void> {
  const [recent] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, type),
        gte(jobs.createdAt, new Date(Date.now() - intervalMs)),
      ),
    )
    .limit(1);

  if (!recent) {
    await enqueueJob({ type });
    logger.info({ type }, "enqueued recurring job");
  }
}

/** Recurring jobs this worker keeps alive (M2: server list sync every 5 min). */
export async function ensureRecurringJobs(): Promise<void> {
  await enqueueIfStale("sync_servers", RECURRING_SYNC_INTERVAL_MS);
}

/**
 * Worker loop: keep recurring jobs scheduled, drain due jobs, then idle for
 * `WORKER_POLL_INTERVAL_MS`. Stops on SIGINT/SIGTERM.
 */
export async function runWorker(): Promise<void> {
  let running = true;
  const shutdown = () => {
    running = false;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logger.info(
    { pollIntervalMs: env.WORKER_POLL_INTERVAL_MS },
    "OpsHub worker started",
  );

  while (running) {
    try {
      await ensureRecurringJobs();
      while (running && (await processNextJob())) {
        // keep draining until the queue is empty
      }
    } catch (error) {
      logger.error({ error: redact(error) }, "worker loop iteration failed");
    }

    if (running) {
      await sleep(env.WORKER_POLL_INTERVAL_MS);
    }
  }

  logger.info("OpsHub worker stopped");
}
