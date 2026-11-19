"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { clients } from "@/lib/db/schema";
import { logger, redact } from "@/lib/logger";
import { clientFormSchema, slugify } from "@/lib/validation";

async function isSignedIn(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

function firstIssue(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input.";
}

export async function createClient(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error.issues) };
  }

  const { name, slug, contactEmail, notes } = parsed.data;

  try {
    const [row] = await db
      .insert(clients)
      .values({
        name,
        slug: slug && slug.length > 0 ? slug : slugify(name),
        contactEmail: contactEmail ? contactEmail : null,
        notes: notes && notes.length > 0 ? notes : null,
      })
      .returning({ id: clients.id });

    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "A client with that slug already exists." };
    }
    logger.error({ error: redact(error) }, "createClient failed");
    return { ok: false, error: "Could not create the client." };
  }
}

export async function updateClient(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error.issues) };
  }

  const { name, slug, contactEmail, notes } = parsed.data;

  try {
    const [row] = await db
      .update(clients)
      .set({
        name,
        slug: slug && slug.length > 0 ? slug : slugify(name),
        contactEmail: contactEmail ? contactEmail : null,
        notes: notes && notes.length > 0 ? notes : null,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, id))
      .returning({ id: clients.id });

    if (!row) {
      return { ok: false, error: "Client not found." };
    }

    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "A client with that slug already exists." };
    }
    logger.error({ error: redact(error) }, "updateClient failed");
    return { ok: false, error: "Could not update the client." };
  }
}

export async function archiveClient(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isSignedIn())) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    const [row] = await db
      .update(clients)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning({ id: clients.id });

    if (!row) {
      return { ok: false, error: "Client not found." };
    }

    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    logger.error({ error: redact(error) }, "archiveClient failed");
    return { ok: false, error: "Could not archive the client." };
  }
}
