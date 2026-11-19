import { db } from "@/lib/db";
import { servers } from "@/lib/db/schema";
import { getPloiClient } from "@/lib/ploi";
import type { PloiMonitoredServer } from "@/lib/ploi";

import type { JobHandler, JobHandlerResult } from "../types";

/**
 * The monitored endpoint does not document a `provider` field, so fall back to
 * any value Ploi happens to send, otherwise "unknown". The `servers.provider`
 * column is NOT NULL, so we must always supply something.
 */
function providerOf(server: PloiMonitoredServer): string {
  const candidate = (server as Record<string, unknown>).provider;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : "unknown";
}

/**
 * `sync_servers`: read `/servers/monitored` and upsert the cached `servers`
 * table. Read-only against Ploi; idempotent (upsert keyed on `ploi_server_id`).
 */
export const syncServersHandler: JobHandler = async ({
  logger,
}): Promise<JobHandlerResult> => {
  const ploi = getPloiClient();
  const monitored = await ploi.listMonitoredServers();
  const now = new Date();

  for (const server of monitored) {
    const values = {
      ploiServerId: server.id,
      name: server.name,
      provider: providerOf(server),
      ipAddress: server.ip ?? "",
      lastSyncedAt: now,
      rawJson: server,
      updatedAt: now,
    };

    await db
      .insert(servers)
      .values(values)
      .onConflictDoUpdate({
        target: servers.ploiServerId,
        set: {
          name: values.name,
          provider: values.provider,
          ipAddress: values.ipAddress,
          lastSyncedAt: values.lastSyncedAt,
          rawJson: values.rawJson,
          updatedAt: values.updatedAt,
        },
      });
  }

  logger.info({ count: monitored.length }, "sync_servers finished");

  return {
    summary: `Synced ${monitored.length} server(s) from Ploi.`,
    data: { count: monitored.length },
  };
};
