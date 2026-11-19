"use server";

import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { logger, redact } from "@/lib/logger";
import { provisionWizardSchema } from "@/lib/validation";

async function isSignedIn(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

function firstIssue(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input.";
}

/**
 * Queue a `provision_site` job (PROJECT.md §6, M3). Nothing is written to Ploi
 * here: the wizard's confirm only enqueues work for the worker, which performs
 * the authorised Ploi writes. `projectId` is generated up front so the worker's
 * retries and the wizard's polling agree on the same row.
 */
export async function startProvisioning(
  input: unknown,
): Promise<ActionResult<{ jobId: string; projectId: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = provisionWizardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error.issues) };
  }

  const data = parsed.data;
  const projectId = crypto.randomUUID();
  const triggerDeploy = Boolean(data.astroRepoUrl || data.cmsRepoUrl);

  try {
    const { id: jobId } = await enqueueJob({
      type: "provision_site",
      payload: {
        projectId,
        clientId: data.clientId,
        name: data.name,
        slug: data.slug && data.slug.length > 0 ? data.slug : undefined,
        domain: data.domain,
        cmsType: data.cmsType,
        cmsUrl: data.cmsUrl ? data.cmsUrl : null,
        astroRepoUrl: data.astroRepoUrl ? data.astroRepoUrl : null,
        cmsRepoUrl: data.cmsRepoUrl ? data.cmsRepoUrl : null,
        ploiServerId: data.ploiServerId,
        webDirectory: data.webDirectory,
        webserverTemplateId: data.webserverTemplateId ?? null,
        systemUser: data.systemUser ? data.systemUser : null,
        triggerDeploy,
      },
    });

    return { ok: true, data: { jobId, projectId } };
  } catch (error) {
    logger.error({ error: redact(error) }, "startProvisioning failed");
    return { ok: false, error: "Could not queue the provisioning job." };
  }
}
