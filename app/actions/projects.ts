"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db/errors";
import { projects } from "@/lib/db/schema";
import { logger, redact } from "@/lib/logger";
import { ploiLinkSchema, projectFormSchema, slugify } from "@/lib/validation";

async function isSignedIn(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

function firstIssue(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input.";
}

function nullable(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export async function createProject(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error.issues) };
  }

  const {
    clientId,
    name,
    slug,
    domain,
    cmsType,
    cmsUrl,
    astroRepoUrl,
    cmsRepoUrl,
  } = parsed.data;

  try {
    const [row] = await db
      .insert(projects)
      .values({
        clientId,
        name,
        slug: slug && slug.length > 0 ? slug : slugify(name),
        domain,
        cmsType,
        cmsUrl: nullable(cmsUrl),
        astroRepoUrl: nullable(astroRepoUrl),
        cmsRepoUrl: nullable(cmsRepoUrl),
      })
      .returning({ id: projects.id });

    revalidatePath("/projects");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "A project with that slug or domain already exists.",
      };
    }
    if (isForeignKeyViolation(error)) {
      return { ok: false, error: "The selected client no longer exists." };
    }
    logger.error({ error: redact(error) }, "createProject failed");
    return { ok: false, error: "Could not create the project." };
  }
}

export async function updateProject(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error.issues) };
  }

  const {
    clientId,
    name,
    slug,
    domain,
    cmsType,
    cmsUrl,
    astroRepoUrl,
    cmsRepoUrl,
  } = parsed.data;

  try {
    const [row] = await db
      .update(projects)
      .set({
        clientId,
        name,
        slug: slug && slug.length > 0 ? slug : slugify(name),
        domain,
        cmsType,
        cmsUrl: nullable(cmsUrl),
        astroRepoUrl: nullable(astroRepoUrl),
        cmsRepoUrl: nullable(cmsRepoUrl),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning({ id: projects.id });

    if (!row) {
      return { ok: false, error: "Project not found." };
    }

    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "A project with that slug or domain already exists.",
      };
    }
    if (isForeignKeyViolation(error)) {
      return { ok: false, error: "The selected client no longer exists." };
    }
    logger.error({ error: redact(error) }, "updateProject failed");
    return { ok: false, error: "Could not update the project." };
  }
}

export async function archiveProject(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    const [row] = await db
      .update(projects)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning({ id: projects.id });

    if (!row) {
      return { ok: false, error: "Project not found." };
    }

    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    logger.error({ error: redact(error) }, "archiveProject failed");
    return { ok: false, error: "Could not archive the project." };
  }
}

export async function linkProjectInfrastructure(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  if (!z.uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid project id." };
  }

  const parsed = ploiLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error.issues) };
  }

  try {
    const [row] = await db
      .update(projects)
      .set({
        ploiServerId: parsed.data.ploiServerId,
        ploiSiteId: parsed.data.ploiSiteId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning({ id: projects.id });

    if (!row) {
      return { ok: false, error: "Project not found." };
    }

    revalidatePath(`/projects/${id}`);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    logger.error({ error: redact(error) }, "linkProjectInfrastructure failed");
    return { ok: false, error: "Could not save the Ploi link." };
  }
}
