import type { JobHandler, JobType } from "../types";
import { provisionSiteHandler } from "./provision-site";
import { pullAuditLogsHandler } from "./pull-audit-logs";
import { syncServerMetricsHandler } from "./sync-server-metrics";
import { syncServersHandler } from "./sync-servers";
import { triggerDeployHandler } from "./trigger-deploy";

/**
 * Registered job handlers, keyed by `jobs.type`. A job whose type has no
 * handler is marked failed rather than silently ignored.
 */
export const jobHandlers: Partial<Record<JobType, JobHandler>> = {
  sync_servers: syncServersHandler,
  sync_server_metrics: syncServerMetricsHandler,
  provision_site: provisionSiteHandler,
  trigger_deploy: triggerDeployHandler,
  pull_audit_logs: pullAuditLogsHandler,
};
