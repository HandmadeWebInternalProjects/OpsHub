import { z } from "zod";

import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { projects } from "@/lib/db/schema";
import type { Project } from "@/lib/db/schema";
import { getPloiClient, PloiError } from "@/lib/ploi";
import type { PloiApi } from "@/lib/ploi";
import { slugify } from "@/lib/validation";
import { eq } from "drizzle-orm";

import { JobAbortError } from "../errors";
import type { JobHandler, JobHandlerResult, JobLogger } from "../types";

/** How long the job waits for the site to appear before giving up. */
const SITE_POLL_TIMEOUT_MS = 5 * 60_000;
/** Deploys can be slower than site creation; allow a longer cap. */
const DEPLOY_POLL_TIMEOUT_MS = 10 * 60_000;
const MIN_POLL_DELAY_MS = 2_000;
const MAX_POLL_DELAY_MS = 20_000;

/**
 * The wizard hands the job everything it needs, because the job — not the
 * Server Action — creates the project row (PROJECT.md §6, M3). `projectId` is
 * generated up front so retries are idempotent.
 */
const provisionSitePayloadSchema = z.object({
  projectId: z.uuid(),
  clientId: z.uuid(),
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1),
  cmsType: z.enum(["payload", "strapi", "other"]),
  cmsUrl: z.string().nullable().optional(),
  astroRepoUrl: z.string().nullable().optional(),
  cmsRepoUrl: z.string().nullable().optional(),
  ploiServerId: z.number().int().positive(),
  webDirectory: z.string().trim().min(1),
  webserverTemplateId: z.number().int().positive().nullable().optional(),
  systemUser: z.string().nullable().optional(),
  projectType: z.string().nullable().optional(),
  triggerDeploy: z.boolean().default(false),
});

type ProvisionSitePayload = z.infer<typeof provisionSitePayloadSchema>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadProject(projectId: string): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
}

async function setStatus(
  projectId: string,
  status: Project["status"],
): Promise<void> {
  await db
    .update(projects)
    .set({ status, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

/**
 * Create the project row (idempotent) or return the existing one. A unique
 * clash on slug/domain is terminal: retrying cannot succeed.
 */
async function ensureProject(
  job: { id: string },
  input: ProvisionSitePayload,
): Promise<Project> {
  const existing = await loadProject(input.projectId);
  if (existing) return existing;

  try {
    const [row] = await db
      .insert(projects)
      .values({
        id: input.projectId,
        clientId: input.clientId,
        name: input.name,
        slug: input.slug ?? slugify(input.name),
        domain: input.domain,
        cmsType: input.cmsType,
        cmsUrl: input.cmsUrl ?? null,
        astroRepoUrl: input.astroRepoUrl ?? null,
        cmsRepoUrl: input.cmsRepoUrl ?? null,
        ploiServerId: input.ploiServerId,
        status: "provisioning",
        provisioningJobId: job.id,
      })
      .returning();
    if (!row) throw new Error("Project insert returned no row.");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new JobAbortError(
        `A project with slug "${input.slug ?? slugify(input.name)}" or domain "${input.domain}" already exists.`,
      );
    }
    throw error;
  }
}

/**
 * Resolve the Ploi site id without ever creating a duplicate: if a previous
 * attempt already recorded one (or a site with this domain exists on the
 * server) it is reused instead of calling `POST /servers/{id}/sites` again.
 */
async function resolveSiteId(
  ploi: PloiApi,
  project: Project,
  input: ProvisionSitePayload,
  logger: JobLogger,
): Promise<number> {
  if (project.ploiSiteId != null) return project.ploiSiteId;

  const existing = (await ploi.listSites(input.ploiServerId)).find(
    (site) => site.domain === input.domain,
  );

  let siteId: number;
  if (existing) {
    siteId = existing.id;
    logger.info(
      { projectId: project.id, siteId },
      "reusing existing Ploi site with the same domain",
    );
  } else {
    const site = await ploi.createSite(input.ploiServerId, {
      rootDomain: input.domain,
      webDirectory: input.webDirectory,
      projectType: input.projectType ?? null,
      systemUser: input.systemUser ?? null,
      webserverTemplate: input.webserverTemplateId ?? null,
    });
    siteId = site.id;
    logger.info({ projectId: project.id, siteId }, "created Ploi site");
  }

  await db
    .update(projects)
    .set({ ploiSiteId: siteId, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  return siteId;
}

/** Poll `GET /servers/{server}/sites/{id}` until Ploi reports the site active. */
async function pollSiteActive(
  ploi: PloiApi,
  serverId: number,
  siteId: number,
): Promise<void> {
  const startedAt = Date.now();
  let waitMs = MIN_POLL_DELAY_MS;

  for (;;) {
    const site = await ploi.getSite(serverId, siteId);
    if (site.status === "active") return;

    if (Date.now() - startedAt > SITE_POLL_TIMEOUT_MS) {
      throw new JobAbortError(
        `Site ${siteId} was still "${site.status ?? "unknown"}" after 5 minutes.`,
      );
    }

    await delay(waitMs);
    waitMs = Math.min(waitMs * 2, MAX_POLL_DELAY_MS);
  }
}

/** Poll the deployment until it leaves the `deploying` state. */
async function pollDeployment(
  ploi: PloiApi,
  serverId: number,
  siteId: number,
  deploymentId: string,
): Promise<"success" | "failed"> {
  const startedAt = Date.now();
  let waitMs = MIN_POLL_DELAY_MS;

  for (;;) {
    const deployment = await ploi.getDeployment(serverId, siteId, deploymentId);
    if (deployment.status === "success") return "success";
    if (deployment.status === "failed") return "failed";

    if (Date.now() - startedAt > DEPLOY_POLL_TIMEOUT_MS) {
      throw new JobAbortError(
        `Deployment ${deploymentId} was still "${deployment.status}" after 10 minutes.`,
      );
    }

    await delay(waitMs);
    waitMs = Math.min(waitMs * 2, MAX_POLL_DELAY_MS);
  }
}

/**
 * `provision_site` (PROJECT.md §6, M3): create the project row, create the Ploi
 * site, wait for it to become active, then deploy (if a repo was configured).
 *
 * Writes are limited to the two endpoints M3 authorises. Idempotent across
 * retries: the project row is keyed on `payload.projectId`, an existing site
 * with the same domain is reused, and a second run against a `live` project is
 * a no-op.
 */
export const provisionSiteHandler: JobHandler = async ({
  job,
  logger,
}): Promise<JobHandlerResult> => {
  const parsed = provisionSitePayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    throw new JobAbortError(
      `Invalid provision_site payload: ${parsed.error.issues[0]?.message ?? "unknown error"}.`,
    );
  }
  const input = parsed.data;
  const ploi = getPloiClient();

  const project = await ensureProject(job, input);

  if (project.status === "archived") {
    throw new JobAbortError("Project is archived; not provisioning.");
  }
  if (project.status === "live") {
    return { summary: `Project ${project.domain} is already live.` };
  }

  const siteId = await resolveSiteId(ploi, project, input, logger);
  await pollSiteActive(ploi, input.ploiServerId, siteId);

  await setStatus(project.id, "deploying");

  if (!input.triggerDeploy) {
    await setStatus(project.id, "live");
    return {
      summary: `Site ${input.domain} is active (no repo configured; deploy skipped).`,
      data: { projectId: project.id, ploiSiteId: siteId, status: "live" },
    };
  }

  let deploymentId: string;
  try {
    ({ deploymentId } = await ploi.deploySite(input.ploiServerId, siteId));
  } catch (error) {
    // Ploi returns 422 when the site has no repository attached yet. The site
    // itself is live, so surface that honestly instead of failing the project.
    if (error instanceof PloiError && error.status === 422) {
      logger.warn(
        { projectId: project.id, siteId },
        "deploy skipped: Ploi reports no repository attached",
      );
      await setStatus(project.id, "live");
      return {
        summary: `Site ${input.domain} is live; deploy skipped (attach a repository in Ploi to deploy).`,
        data: { projectId: project.id, ploiSiteId: siteId, status: "live" },
      };
    }
    throw error;
  }

  const outcome = await pollDeployment(
    ploi,
    input.ploiServerId,
    siteId,
    deploymentId,
  );

  if (outcome === "failed") {
    await setStatus(project.id, "failed");
    throw new JobAbortError(`Deployment ${deploymentId} failed.`);
  }

  await setStatus(project.id, "live");
  return {
    summary: `Provisioned ${input.domain} and deployed successfully.`,
    data: { projectId: project.id, ploiSiteId: siteId, status: "live" },
  };
};
