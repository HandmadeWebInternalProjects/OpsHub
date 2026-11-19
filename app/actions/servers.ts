"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { logger, redact } from "@/lib/logger";
import { getPloiClient, PloiError } from "@/lib/ploi";

async function isSignedIn(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

/** Enqueue a `sync_servers` job. The worker performs the actual Ploi read. */
export async function syncServersNow(): Promise<
  ActionResult<{ jobId: string }>
> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    const { id } = await enqueueJob({ type: "sync_servers" });
    revalidatePath("/servers");
    return { ok: true, data: { jobId: id } };
  } catch (error) {
    logger.error({ error: redact(error) }, "syncServersNow failed");
    return { ok: false, error: "Could not queue the sync job." };
  }
}

export type PloiSiteOption = {
  id: number;
  domain: string;
  status: string | null;
};

/** Read-only: list the sites on a Ploi server (for the project link dropdown). */
export async function listServerSites(
  ploiServerId: number,
): Promise<ActionResult<PloiSiteOption[]>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    const sites = await getPloiClient().listSites(ploiServerId);
    return {
      ok: true,
      data: sites.map((site) => ({
        id: site.id,
        domain: site.domain,
        status: site.status ?? null,
      })),
    };
  } catch (error) {
    if (error instanceof PloiError) {
      return { ok: false, error: `Ploi: ${error.message}` };
    }
    logger.error({ error: redact(error) }, "listServerSites failed");
    return { ok: false, error: "Could not load sites from Ploi." };
  }
}

export type PloiTemplateOption = { id: number; label: string };

/** Read-only: the webserver templates saved in the Ploi account (wizard step 3). */
export async function listWebserverTemplates(): Promise<
  ActionResult<PloiTemplateOption[]>
> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    const templates = await getPloiClient().listWebserverTemplates();
    return {
      ok: true,
      data: templates.map((template) => ({
        id: template.id,
        label: template.label,
      })),
    };
  } catch (error) {
    if (error instanceof PloiError) {
      return { ok: false, error: `Ploi: ${error.message}` };
    }
    logger.error({ error: redact(error) }, "listWebserverTemplates failed");
    return {
      ok: false,
      error: "Could not load webserver templates from Ploi.",
    };
  }
}

/** Read-only: the system users on a Ploi server (wizard step 3, optional). */
export async function listSystemUsers(
  ploiServerId: number,
): Promise<ActionResult<{ name: string }[]>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    const users = await getPloiClient().listSystemUsers(ploiServerId);
    return { ok: true, data: users.map((user) => ({ name: user.name })) };
  } catch (error) {
    if (error instanceof PloiError) {
      return { ok: false, error: `Ploi: ${error.message}` };
    }
    logger.error({ error: redact(error) }, "listSystemUsers failed");
    return { ok: false, error: "Could not load system users from Ploi." };
  }
}
