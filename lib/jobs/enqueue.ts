import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

import type { JobType } from "./types";

export type EnqueueJobInput = {
  type: JobType;
  payload?: Record<string, unknown>;
  scheduledFor?: Date;
};

/** Insert a pending job and return its id. Never mutates external systems. */
export async function enqueueJob(
  input: EnqueueJobInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(jobs)
    .values({
      type: input.type,
      payload: input.payload ?? {},
      scheduledFor: input.scheduledFor ?? new Date(),
    })
    .returning({ id: jobs.id });

  return { id: row.id };
}
