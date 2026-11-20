import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { deployEvents, projects } from "@/lib/db/schema";
import type { Project } from "@/lib/db/schema";
import { JobAbortError } from "@/lib/jobs/errors";
import type { PloiApi, PloiDeployment } from "@/lib/ploi";

export type DeployEventKind =
  "deploy_started" | "deploy_completed" | "deploy_failed";

type DeploymentMapping = {
  event: DeployEventKind;
  projectStatus: Project["status"];
  terminal: boolean;
};

/**
 * Map a raw Ploi deployment status onto an OpsHub deploy event and the project
 * status it implies. `success` → live, `failed`/`cancelled` → failed, anything
 * still running (`deploying`/`scheduled`) → deploying.
 */
export function mapDeploymentStatus(status: string): DeploymentMapping {
  switch (status) {
    case "success":
      return {
        event: "deploy_completed",
        projectStatus: "live",
        terminal: true,
      };
    case "failed":
    case "cancelled":
      return {
        event: "deploy_failed",
        projectStatus: "failed",
        terminal: true,
      };
    default:
      return {
        event: "deploy_started",
        projectStatus: "deploying",
        terminal: false,
      };
  }
}

/** Set a project's status without touching anything else. */
export async function setProjectStatus(
  projectId: string,
  status: Project["status"],
): Promise<void> {
  await db
    .update(projects)
    .set({ status, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

/**
 * Append a deploy event. Idempotent on `externalId` (the Ploi deployment id):
 * a repeated notification for the same deployment is silently ignored. A
 * `started` event has no deployment id yet, so its `externalId` is null (and
 * Postgres treats each null as distinct, which is what we want).
 */
export async function insertDeployEvent(input: {
  projectId: string;
  externalId: string | null;
  event: DeployEventKind;
  status: string;
  message: string | null;
  occurredAt?: Date;
}): Promise<void> {
  await db
    .insert(deployEvents)
    .values({
      projectId: input.projectId,
      externalId: input.externalId,
      event: input.event,
      status: input.status,
      message: input.message,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .onConflictDoNothing({ target: deployEvents.externalId });
}

/**
 * Record one Ploi deployment: update the project status and append the matching
 * deploy event. Safe to call more than once for the same deployment.
 */
export async function recordDeployment(
  projectId: string,
  deployment: PloiDeployment,
): Promise<DeploymentMapping> {
  const mapped = mapDeploymentStatus(deployment.status);
  await setProjectStatus(projectId, mapped.projectStatus);
  await insertDeployEvent({
    projectId,
    externalId: deployment.id,
    event: mapped.event,
    status: deployment.status,
    message: deployment.commit_message ?? deployment.commit_hash ?? null,
    occurredAt: parsePloiDate(deployment.created_at),
  });
  return mapped;
}

const MIN_POLL_DELAY_MS = 2_000;
const MAX_POLL_DELAY_MS = 20_000;
const DEPLOY_POLL_TIMEOUT_MS = 10 * 60_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `GET .../deployments/{id}` until the deployment reaches a terminal
 * state, then return it. Aborts (non-retryable) if it is still running after
 * the timeout.
 */
export async function pollDeploymentStatus(
  ploi: PloiApi,
  serverId: number,
  siteId: number,
  deploymentId: string,
  timeoutMs = DEPLOY_POLL_TIMEOUT_MS,
): Promise<PloiDeployment> {
  const startedAt = Date.now();
  let waitMs = MIN_POLL_DELAY_MS;

  for (;;) {
    const deployment = await ploi.getDeployment(serverId, siteId, deploymentId);
    if (mapDeploymentStatus(deployment.status).terminal) {
      return deployment;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new JobAbortError(
        `Deployment ${deploymentId} was still "${deployment.status}" after ${Math.round(
          timeoutMs / 60_000,
        )} minutes.`,
      );
    }

    await delay(waitMs);
    waitMs = Math.min(waitMs * 2, MAX_POLL_DELAY_MS);
  }
}

/**
 * Ploi timestamps look like `2026-11-11 14:02:51` (no offset); treat them as
 * UTC. Falls back to `undefined` (the column default) when unparseable.
 */
export function parsePloiDate(
  value: string | null | undefined,
): Date | undefined {
  if (!value) return undefined;
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const zoned = /(?:Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`;
  const date = new Date(zoned);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
