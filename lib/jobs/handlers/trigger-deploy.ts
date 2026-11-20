import { eq } from "drizzle-orm";
import { z } from "zod";

import { evaluateDeployFailed } from "@/lib/alerts";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import {
  insertDeployEvent,
  pollDeploymentStatus,
  recordDeployment,
  setProjectStatus,
} from "@/lib/deploy";
import { getPloiClient, PloiError } from "@/lib/ploi";
import { redact } from "@/lib/logger";

import { JobAbortError } from "../errors";
import type { JobHandler, JobHandlerResult } from "../types";

const triggerDeployPayloadSchema = z.object({ projectId: z.uuid() });

/**
 * `trigger_deploy` (PROJECT.md §6, M4): redeploy an already-linked project.
 *
 * The only Ploi write is `POST /servers/{server}/sites/{id}/deploy` — the
 * endpoint M4 authorises. After the deploy is queued the handler polls the
 * deployment to a terminal state and records the outcome (status + timeline
 * event), so a manual redeploy behaves exactly like a CI-driven webhook.
 */
export const triggerDeployHandler: JobHandler = async ({
  job,
  logger,
}): Promise<JobHandlerResult> => {
  const parsed = triggerDeployPayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    throw new JobAbortError("Invalid trigger_deploy payload.");
  }
  const { projectId } = parsed.data;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new JobAbortError(`Project ${projectId} not found.`);
  }
  if (project.status === "archived") {
    throw new JobAbortError("Project is archived; not deploying.");
  }
  if (project.ploiServerId == null || project.ploiSiteId == null) {
    throw new JobAbortError(
      "Project is not linked to a Ploi server and site; link them before deploying.",
    );
  }

  const serverId = project.ploiServerId;
  const siteId = project.ploiSiteId;
  const ploi = getPloiClient();

  let deploymentId: string;
  try {
    ({ deploymentId } = await ploi.deploySite(serverId, siteId));
  } catch (error) {
    // Ploi returns 422 when there is nothing to deploy (no repository, already
    // deploying, or WordPress). Nothing changed, so leave the status as it was.
    if (error instanceof PloiError && error.status === 422) {
      logger.warn(
        { projectId: project.id, siteId },
        "deploy refused by Ploi (no repository / already deploying)",
      );
      throw new JobAbortError(
        "Ploi refused the deployment: no repository is attached, a deploy is already running, or the site is WordPress.",
      );
    }
    throw error;
  }

  await setProjectStatus(project.id, "deploying");
  await insertDeployEvent({
    projectId: project.id,
    externalId: null,
    event: "deploy_started",
    status: "deploying",
    message: "Deployment requested from OpsHub.",
  });

  const deployment = await pollDeploymentStatus(
    ploi,
    serverId,
    siteId,
    deploymentId,
  );
  const mapped = await recordDeployment(project.id, deployment);

  if (mapped.event === "deploy_failed") {
    try {
      await evaluateDeployFailed({
        projectId: project.id,
        projectName: project.name,
        deploymentId: deployment.id,
        message: deployment.commit_message ?? null,
      });
    } catch (error) {
      logger.warn(
        { projectId: project.id, error: redact(error) },
        "deploy_failed alert evaluation failed",
      );
    }
  }

  if (mapped.projectStatus === "failed") {
    throw new JobAbortError(`Deployment ${deploymentId} failed.`);
  }

  return {
    summary: `Deployed ${project.domain} successfully.`,
    data: { projectId: project.id, deploymentId, status: "live" },
  };
};
