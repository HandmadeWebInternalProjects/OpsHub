import { and, count, eq, gte, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { alertRules, alerts, auditSummaries } from "@/lib/db/schema";
import type { AlertRule } from "@/lib/db/schema";
import { logger, redact } from "@/lib/logger";

import { getAlertDelivery } from "./deliver";
import type { AlertRuleType } from "./types";

/** The window an `audit_login_failed_count` rule counts over (PROJECT.md §6). */
export const AUDIT_LOGIN_WINDOW_MS = 60 * 60_000;

/** Drizzle returns `numeric` columns as strings; nil/NaN become null. */
function toNumber(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Does an observed value breach a rule? Pure, so it is unit-tested directly.
 * Comparisons follow PROJECT.md §6: `server_disk_pct > X`,
 * `page_score_performance < X`, `audit_login_failed_count > X` (the window is
 * applied by the caller); `deploy_failed` has no threshold.
 */
export function shouldFire(
  ruleType: AlertRuleType,
  value: number,
  threshold: number | null,
): boolean {
  if (ruleType === "deploy_failed") return true;
  if (threshold == null) return false;
  switch (ruleType) {
    case "page_score_performance":
      return value < threshold;
    case "server_disk_pct":
    case "audit_login_failed_count":
      return value > threshold;
  }
}

/**
 * Enabled rules of `ruleType` that apply to the given projects: fleet-wide rules
 * (no `project_id`) plus any scoped to one of `projectIds`.
 */
async function matchingRules(
  ruleType: AlertRuleType,
  projectIds: string[],
): Promise<AlertRule[]> {
  const scope =
    projectIds.length > 0
      ? or(
          isNull(alertRules.projectId),
          inArray(alertRules.projectId, projectIds),
        )
      : isNull(alertRules.projectId);

  return db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.ruleType, ruleType),
        eq(alertRules.enabled, true),
        scope,
      ),
    );
}

type FireInput = {
  rule: AlertRule;
  projectId: string | null;
  serverId: string | null;
  subject: string;
  title: string;
  detail: string;
};

/**
 * Persist a fired alert and deliver it. Deduplication relies on the partial
 * unique index on `dedupe_key` WHERE status = 'open', so while an alert for the
 * same rule + subject is open the insert is a no-op (no repeat delivery).
 * Returns true when a new alert was created.
 */
async function recordAndDeliver(input: FireInput): Promise<boolean> {
  const dedupeKey = `${input.rule.id}:${input.subject}`;

  const [row] = await db
    .insert(alerts)
    .values({
      ruleId: input.rule.id,
      projectId: input.projectId,
      serverId: input.serverId,
      ruleType: input.rule.ruleType,
      status: "open",
      title: input.title,
      detail: input.detail,
      dedupeKey,
      triggeredAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: alerts.id });

  if (!row) return false;

  try {
    await getAlertDelivery().send({
      channel: input.rule.channel,
      destination: input.rule.destination,
      title: input.title,
      detail: input.detail,
    });
    await db
      .update(alerts)
      .set({
        deliveredAt: new Date(),
        deliveryError: null,
        updatedAt: new Date(),
      })
      .where(eq(alerts.id, row.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { alertId: row.id, error: redact(error) },
      "alert delivery failed",
    );
    await db
      .update(alerts)
      .set({ deliveryError: message, updatedAt: new Date() })
      .where(eq(alerts.id, row.id));
  }

  return true;
}

/** Evaluate `server_disk_pct` rules for one server (fleet-wide + its projects). */
export async function evaluateServerDisk(input: {
  serverId: string;
  serverName: string;
  diskPct: number;
  projectIds?: string[];
}): Promise<number> {
  const rules = await matchingRules("server_disk_pct", input.projectIds ?? []);
  let fired = 0;

  for (const rule of rules) {
    const threshold = toNumber(rule.threshold);
    if (!shouldFire("server_disk_pct", input.diskPct, threshold)) continue;

    const created = await recordAndDeliver({
      rule,
      projectId: rule.projectId,
      serverId: input.serverId,
      subject: input.serverId,
      title: `Disk usage high on ${input.serverName}`,
      detail: `Disk usage is ${input.diskPct}% on server ${input.serverName} (threshold ${threshold}%).`,
    });
    if (created) fired += 1;
  }

  return fired;
}

/** Evaluate `page_score_performance` rules for one project's latest report. */
export async function evaluatePageScore(input: {
  projectId: string;
  projectName: string;
  performance: number;
}): Promise<number> {
  const rules = await matchingRules("page_score_performance", [
    input.projectId,
  ]);
  let fired = 0;

  for (const rule of rules) {
    const threshold = toNumber(rule.threshold);
    if (!shouldFire("page_score_performance", input.performance, threshold))
      continue;

    const created = await recordAndDeliver({
      rule,
      projectId: input.projectId,
      serverId: null,
      subject: input.projectId,
      title: `Low performance score for ${input.projectName}`,
      detail: `Performance is ${input.performance} for ${input.projectName} (threshold ${threshold}).`,
    });
    if (created) fired += 1;
  }

  return fired;
}

/** Evaluate `deploy_failed` rules for one project after a failed deployment. */
export async function evaluateDeployFailed(input: {
  projectId: string;
  projectName: string;
  deploymentId: string | null;
  message: string | null;
}): Promise<number> {
  const rules = await matchingRules("deploy_failed", [input.projectId]);
  let fired = 0;

  for (const rule of rules) {
    const created = await recordAndDeliver({
      rule,
      projectId: input.projectId,
      serverId: null,
      subject: input.deploymentId ?? `project:${input.projectId}`,
      title: `Deployment failed for ${input.projectName}`,
      detail: `Deployment ${input.deploymentId ?? ""} failed for ${input.projectName}${input.message ? `: ${input.message}` : "."}`,
    });
    if (created) fired += 1;
  }

  return fired;
}

/**
 * Evaluate `audit_login_failed_count` rules for one project: count `login_failed`
 * audit events in the last hour and fire when the count breaches the threshold.
 */
export async function evaluateAuditLoginFailed(input: {
  projectId: string;
  projectName: string;
}): Promise<number> {
  const rules = await matchingRules("audit_login_failed_count", [
    input.projectId,
  ]);
  if (rules.length === 0) return 0;

  const since = new Date(Date.now() - AUDIT_LOGIN_WINDOW_MS);
  const [row] = await db
    .select({ value: count() })
    .from(auditSummaries)
    .where(
      and(
        eq(auditSummaries.projectId, input.projectId),
        eq(auditSummaries.eventType, "login_failed"),
        gte(auditSummaries.capturedAt, since),
      ),
    );
  const failures = Number(row?.value ?? 0);

  let fired = 0;
  for (const rule of rules) {
    const threshold = toNumber(rule.threshold);
    if (!shouldFire("audit_login_failed_count", failures, threshold)) continue;

    const created = await recordAndDeliver({
      rule,
      projectId: input.projectId,
      serverId: null,
      subject: input.projectId,
      title: `Repeated failed logins for ${input.projectName}`,
      detail: `${failures} failed login(s) in the last hour for ${input.projectName} (threshold ${threshold}).`,
    });
    if (created) fired += 1;
  }

  return fired;
}
