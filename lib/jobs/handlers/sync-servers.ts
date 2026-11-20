import { getPloiClient } from "@/lib/ploi";
import { upsertMonitoredServers } from "@/lib/servers";

import type { JobHandler, JobHandlerResult } from "../types";

/**
 * `sync_servers`: read `/servers/monitored` and upsert the cached `servers`
 * table. Read-only against Ploi; idempotent (upsert keyed on `ploi_server_id`).
 */
export const syncServersHandler: JobHandler = async ({
  logger,
}): Promise<JobHandlerResult> => {
  const ploi = getPloiClient();
  const monitored = await ploi.listMonitoredServers();

  const count = await upsertMonitoredServers(monitored);

  logger.info({ count }, "sync_servers finished");

  return {
    summary: `Synced ${count} server(s) from Ploi.`,
    data: { count },
  };
};
