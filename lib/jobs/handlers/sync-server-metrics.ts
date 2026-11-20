import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { metricsSnapshots, servers } from "@/lib/db/schema";
import {
  latestStatistic,
  metricsRetentionCutoff,
  parseStatistic,
} from "@/lib/metrics";
import { getPloiClient } from "@/lib/ploi";
import { upsertMonitoredServers } from "@/lib/servers";

import type { JobHandler, JobHandlerResult } from "../types";

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

  logger.info(
    { written, skipped, pruned: pruned.length },
    "sync_server_metrics finished",
  );

  return {
    summary: `Wrote ${written} snapshot(s); pruned ${pruned.length} older than 90 days.`,
    data: { written, skipped, pruned: pruned.length },
  };
};
