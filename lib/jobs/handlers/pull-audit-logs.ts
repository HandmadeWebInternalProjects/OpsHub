import { and, desc, eq, isNotNull, ne } from "drizzle-orm";

import { getCmsProvider } from "@/lib/cms";
import { NullCmsProvider } from "@/lib/cms/null-provider";
import { db } from "@/lib/db";
import { auditSummaries, projects } from "@/lib/db/schema";
import { getCmsToken } from "@/lib/integration-config";
import { redact } from "@/lib/logger";

import type { JobHandler, JobHandlerResult } from "../types";

/**
 * `pull_audit_logs` (PROJECT.md §5.3/§6, M7): for every non-archived project
 * with a `cms_url`, pull the last 50 audit events since the last successful sync
 * and upsert them into `audit_summaries`, deduped on `external_id`.
 *
 * Read-only against the client CMS. One job covers the whole fleet; the worker
 * re-enqueues it every 15 minutes (per-project cadence). A project without a
 * usable provider (no URL/token, or type `other`) is skipped, not failed.
 */
export const pullAuditLogsHandler: JobHandler = async ({
  logger,
}): Promise<JobHandlerResult> => {
  const candidates = await db
    .select()
    .from(projects)
    .where(and(ne(projects.status, "archived"), isNotNull(projects.cmsUrl)));

  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const project of candidates) {
    try {
      const token = await getCmsToken(project.id);
      const provider = getCmsProvider({
        type: project.cmsType,
        projectId: project.id,
        cmsUrl: project.cmsUrl,
        token,
      });

      if (provider instanceof NullCmsProvider) {
        skipped += 1;
        continue;
      }

      const [last] = await db
        .select({ capturedAt: auditSummaries.capturedAt })
        .from(auditSummaries)
        .where(eq(auditSummaries.projectId, project.id))
        .orderBy(desc(auditSummaries.capturedAt))
        .limit(1);

      const events = await provider.listAuditEvents(
        project,
        last?.capturedAt ?? null,
      );

      for (const event of events) {
        const [row] = await db
          .insert(auditSummaries)
          .values({
            projectId: project.id,
            externalId: event.externalId,
            capturedAt: event.occurredAt,
            eventType: event.eventType,
            actor: event.actor,
            ipAddress: event.ipAddress,
            summary: event.summary,
          })
          .onConflictDoNothing({ target: auditSummaries.externalId })
          .returning({ id: auditSummaries.id });

        if (row) written += 1;
        else skipped += 1;
      }
    } catch (error) {
      failed += 1;
      logger.warn(
        { projectId: project.id, error: redact(error) },
        "pull_audit_logs: project failed",
      );
    }
  }

  // If every eligible project failed, surface it so the job retries.
  if (failed > 0 && failed === candidates.length) {
    throw new Error(`Audit sync failed for all ${failed} project(s).`);
  }

  logger.info(
    { written, skipped, failed, candidates: candidates.length },
    "pull_audit_logs finished",
  );

  return {
    summary: `Wrote ${written} audit event(s) from ${candidates.length - failed} project(s); ${skipped} skipped.`,
    data: { written, skipped, failed },
  };
};
