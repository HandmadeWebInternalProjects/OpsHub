import { db } from "@/lib/db";
import { servers } from "@/lib/db/schema";
import type { PloiMonitoredServer } from "@/lib/ploi";

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
 * Upsert the cached `servers` table from `/servers/monitored`. Idempotent
 * (keyed on `ploi_server_id`) and read-only against Ploi. Shared by the
 * `sync_servers` job and the `sync_server_metrics` job, so metrics can rely on
 * the server rows existing.
 */
export async function upsertMonitoredServers(
  monitored: PloiMonitoredServer[],
): Promise<number> {
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

  return monitored.length;
}
