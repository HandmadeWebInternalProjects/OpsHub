import { and, eq, lt, ne } from "drizzle-orm";

import { evaluateServerDisk } from "@/lib/alerts";
import { db } from "@/lib/db";
import { metricsSnapshots, projects, servers } from "@/lib/db/schema";
import {
  latestStatistic,
  metricsRetentionCutoff,
  parseStatistic,
} from "@/lib/metrics";
import { getPloiClient } from "@/lib/ploi";
import type { PloiMonitoredServer } from "@/lib/ploi";
import { redact } from "@/lib/logger";
import { upsertMonitoredServers } from "@/lib/servers";

import type { JobHandler, JobHandlerResult, JobLogger } from "../types";

/**
 * `sync_server_metrics` (PROJECT.md §6, M5): read `/servers/monitored`, write one
 * `metrics_snapshots` row per server for the latest datapoint, then prune rows
 * older than the retention window.
 *
 * Read-only against Ploi. The server rows are upserted first so the FK exists
 * even if `sync_servers` has not run yet. Idempotent on (server_id, captured_at)
 * so a retried run does not double-write.
 */
export const syncServerMetricsHandler: JobHandler = async ({
  logger,
}): Promise<JobHandlerResult> => {
  const ploi = getPloiClient();
  const monitored = await ploi.listMonitoredServers();

  await upsertMonitoredServers(monitored);

  const cached = await db
    .select({ id: servers.id, ploiServerId: servers.ploiServerId })
    .from(servers);
  const idByPloi = new Map(cached.map((row) => [row.ploiServerId, row.id]));

  let written = 0;
  let skipped = 0;

  for (const server of monitored) {
    const serverId = idByPloi.get(server.id);
    const statistic = latestStatistic(server.statistics);

    if (serverId == null || statistic == null) {
      skipped += 1;
      continue;
    }

    const metric = parseStatistic(statistic);

    const [existing] = await db
      .select({ id: metricsSnapshots.id })
      .from(metricsSnapshots)
      .where(
        and(
          eq(metricsSnapshots.serverId, serverId),
          eq(metricsSnapshots.capturedAt, metric.capturedAt),
        ),
      )
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }

    await db.insert(metricsSnapshots).values({
      serverId,
      capturedAt: metric.capturedAt,
      cpuPct: metric.cpuPct,
      ramPct: metric.ramPct,
      diskUsedPct: metric.diskUsedPct,
      loadAvg1m: metric.loadAvg1m,
    });
    written += 1;
  }

  const pruned = await db
    .delete(metricsSnapshots)
    .where(lt(metricsSnapshots.capturedAt, metricsRetentionCutoff()))
    .returning({ id: metricsSnapshots.id });

  const alertsFired = await evaluateDiskRules(monitored, idByPloi, logger);

  logger.info(
    { written, skipped, pruned: pruned.length, alertsFired },
    "sync_server_metrics finished",
  );

  return {
    summary: `Wrote ${written} snapshot(s); pruned ${pruned.length} older than 90 days.`,
    data: { written, skipped, pruned: pruned.length, alertsFired },
  };
};

/**
 * Evaluate `server_disk_pct` rules for each server just measured. Projects are
 * grouped by their Ploi server id so project-scoped rules are matched too. A
 * rule failure never fails the metrics job; it is logged and skipped.
 */
async function evaluateDiskRules(
  monitored: PloiMonitoredServer[],
  idByPloi: Map<number, string>,
  logger: JobLogger,
): Promise<number> {
  const projectRows = await db
    .select({ id: projects.id, ploiServerId: projects.ploiServerId })
    .from(projects)
    .where(ne(projects.status, "archived"));

  const projectIdsByServer = new Map<number, string[]>();
  for (const row of projectRows) {
    if (row.ploiServerId == null) continue;
    const list = projectIdsByServer.get(row.ploiServerId) ?? [];
    list.push(row.id);
    projectIdsByServer.set(row.ploiServerId, list);
  }

  let fired = 0;
  for (const server of monitored) {
    const serverId = idByPloi.get(server.id);
    const statistic = latestStatistic(server.statistics);
    const diskUsedPct = statistic
      ? parseStatistic(statistic).diskUsedPct
      : null;
    const diskPct = diskUsedPct == null ? null : Number(diskUsedPct);

    if (serverId == null || diskPct == null || !Number.isFinite(diskPct)) {
      continue;
    }

    try {
      fired += await evaluateServerDisk({
        serverId,
        serverName: server.name,
        diskPct,
        projectIds: projectIdsByServer.get(server.id) ?? [],
      });
    } catch (error) {
      logger.warn(
        { error: redact(error), serverId },
        "server_disk_pct evaluation failed",
      );
    }
  }

  return fired;
}
