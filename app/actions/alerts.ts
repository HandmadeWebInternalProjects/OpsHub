"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertRules, alerts } from "@/lib/db/schema";
import { logger, redact } from "@/lib/logger";
import { alertRuleFormSchema } from "@/lib/validation";

async function currentUser(): Promise<{ email: string } | null> {
  const session = await auth();
  if (!session?.user) return null;
  return { email: session.user.email ?? "unknown" };
}

function revalidateAlerts(): void {
  revalidatePath("/alerts");
  revalidatePath("/settings");
}

/** Create an alert rule (M8). */
export async function createAlertRule(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  if (!(await currentUser())) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = alertRuleFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const value = parsed.data;
  const threshold =
    value.ruleType === "deploy_failed" ||
    value.threshold === undefined ||
    value.threshold === ""
      ? null
      : String(value.threshold);
  const destination = value.destination?.trim()
    ? value.destination.trim()
    : null;

  try {
    const [row] = await db
      .insert(alertRules)
      .values({
        ruleType: value.ruleType,
        projectId: value.projectId ? value.projectId : null,
        threshold,
        channel: value.channel,
        destination,
      })
      .returning({ id: alertRules.id });

    revalidateAlerts();
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    logger.error({ error: redact(error) }, "createAlertRule failed");
    return { ok: false, error: "Could not create the rule." };
  }
}

/** Enable or disable an alert rule (M8). */
export async function setAlertRuleEnabled(
  id: string,
  enabled: boolean,
): Promise<ActionResult<{ id: string }>> {
  if (!(await currentUser())) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    await db
      .update(alertRules)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(alertRules.id, id));
    revalidateAlerts();
    return { ok: true, data: { id } };
  } catch (error) {
    logger.error({ error: redact(error) }, "setAlertRuleEnabled failed");
    return { ok: false, error: "Could not update the rule." };
  }
}

/** Delete an alert rule (its fired alerts cascade) (M8). */
export async function deleteAlertRule(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  if (!(await currentUser())) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    await db.delete(alertRules).where(eq(alertRules.id, id));
    revalidateAlerts();
    return { ok: true, data: { id } };
  } catch (error) {
    logger.error({ error: redact(error) }, "deleteAlertRule failed");
    return { ok: false, error: "Could not delete the rule." };
  }
}

/** Acknowledge a fired alert (M8). */
export async function acknowledgeAlert(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await currentUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    const [row] = await db
      .update(alerts)
      .set({
        status: "acknowledged",
        acknowledgedAt: new Date(),
        acknowledgedBy: user.email,
        updatedAt: new Date(),
      })
      .where(eq(alerts.id, id))
      .returning({ id: alerts.id });

    if (!row) return { ok: false, error: "Alert not found." };

    revalidateAlerts();
    return { ok: true, data: { id } };
  } catch (error) {
    logger.error({ error: redact(error) }, "acknowledgeAlert failed");
    return { ok: false, error: "Could not acknowledge the alert." };
  }
}
