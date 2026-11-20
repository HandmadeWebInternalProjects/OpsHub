"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { clearCmsToken, setCmsToken } from "@/lib/integration-config";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { logger, redact } from "@/lib/logger";
import { cmsTokenSchema } from "@/lib/validation";

async function isSignedIn(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

async function projectExists(projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return Boolean(row);
}

/** Store a project's CMS audit token, encrypted at rest (M7). */
export async function saveCmsToken(
  input: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = cmsTokenSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { projectId, token } = parsed.data;

  try {
    if (!(await projectExists(projectId))) {
      return { ok: false, error: "Project not found." };
    }

    await setCmsToken(projectId, token);
    revalidatePath("/settings");
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { projectId } };
  } catch (error) {
    logger.error({ error: redact(error) }, "saveCmsToken failed");
    return { ok: false, error: "Could not save the token." };
  }
}

/** Remove a project's CMS audit token (M7). */
export async function clearCmsTokenAction(
  projectId: string,
): Promise<ActionResult<{ projectId: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  if (!(await projectExists(projectId))) {
    return { ok: false, error: "Project not found." };
  }

  try {
    await clearCmsToken(projectId);
    revalidatePath("/settings");
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { projectId } };
  } catch (error) {
    logger.error({ error: redact(error) }, "clearCmsToken failed");
    return { ok: false, error: "Could not clear the token." };
  }
}

/** Queue an immediate `pull_audit_logs` run for the whole fleet (M7). */
export async function enqueueAuditSync(): Promise<
  ActionResult<{ jobId: string }>
> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    const { id } = await enqueueJob({ type: "pull_audit_logs" });
    return { ok: true, data: { jobId: id } };
  } catch (error) {
    logger.error({ error: redact(error) }, "enqueueAuditSync failed");
    return { ok: false, error: "Could not queue the audit sync." };
  }
}
