import { z } from "zod";

/**
 * Ploi API response schemas (PROJECT.md §5.1).
 *
 * Shapes verified against https://developers.ploi.io on 2026-11-20. Objects are
 * loose (they tolerate extra fields Ploi may add) but the fields we depend on
 * are required and type-checked. Ploi is inconsistent about numeric types
 * (e.g. `php_version` is a string in list responses, a number in the single
 * response), so those fields are modelled as `string | number`.
 */

const looseNumber = z.union([z.number(), z.string()]);

/** `GET /servers/{id}` — a single server. */
export const ploiServerSchema = z.looseObject({
  id: z.number(),
  type: z.string().nullish(),
  name: z.string(),
  ip_address: z.string().nullish(),
  php_version: looseNumber.nullish(),
  php_cli_version: looseNumber.nullish(),
  installed_php_versions: z.array(z.string()).nullish(),
  mysql_version: looseNumber.nullish(),
  sites_count: z.number().nullish(),
  status: z.string().nullish(),
  status_id: z.number().nullish(),
  monitoring: z.boolean().nullish(),
  created_at: z.string().nullish(),
});

/** One entry in `GET /servers/monitored`'s `statistics` array.
 *
 * The docs show a flat per-datapoint shape (`cpu`/`ram`/`disk`/`load_average`/
 * `date`), but the **live** API returns named time series
 * (`{ name: "CPU", data: { "10:25": 4.1, … } }`) — verified 2026-11-20. Both are
 * accepted; `lib/metrics.ts` normalises either into a snapshot row. */
export const ploiServerStatisticSchema = z.looseObject({
  // Live shape: a named series of time → value samples.
  name: z.string().nullish(),
  data: z.record(z.string(), z.union([z.number(), z.string()])).nullish(),
  // Documented / legacy flat shape, tolerated for compatibility.
  cpu: z.string().nullish(),
  ram: z.string().nullish(),
  disk: z.string().nullish(),
  load_average: z.string().nullish(),
  date: z.string().nullish(),
});

/**
 * `GET /servers/monitored` — monitored servers with their recent statistics.
 * This endpoint is NOT paginated (a bare `data` array).
 */
export const ploiMonitoredServerSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  ip: z.string().nullish(),
  url: z.string().nullish(),
  statistics: z.array(ploiServerStatisticSchema).default([]),
});

/** A site, as returned by list and single endpoints. */
export const ploiSiteSchema = z.looseObject({
  id: z.number(),
  server_id: z.number().nullish(),
  status: z.string().nullish(),
  domain: z.string(),
  // The docs show a boolean, but the live API returns the deploy script text.
  deploy_script: z.union([z.boolean(), z.string()]).nullish(),
  web_directory: z.string().nullish(),
  project_type: z.string().nullish(),
  project_root: z.string().nullish(),
  last_deploy_at: z.string().nullish(),
  system_user: z.string().nullish(),
  php_version: looseNumber.nullish(),
  health_url: z.string().nullish(),
  has_repository: z.boolean().nullish(),
  deployment_type: z.string().nullish(),
  quick_deploy: z.boolean().nullish(),
  created_at: z.string().nullish(),
});

/** Ploi list endpoints wrap results in `data` + a pagination `meta` block. */
export function ploiPaginated<T extends z.ZodType>(item: T) {
  return z.looseObject({
    data: z.array(item),
    meta: z.looseObject({
      current_page: z.number(),
      last_page: z.number(),
      per_page: z.number(),
      total: z.number(),
    }),
  });
}

/** `{ data: T }` envelope for single-resource responses. */
export function ploiEnvelope<T extends z.ZodType>(item: T) {
  return z.looseObject({ data: item });
}

/** A saved webserver template (`GET /webserver-templates`). */
export const ploiWebserverTemplateSchema = z.looseObject({
  id: z.number(),
  label: z.string(),
  content: z.string().nullish(),
  created_at: z.string().nullish(),
});

/** A system user on a server (`GET /servers/{server}/system-users`). */
export const ploiSystemUserSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  root: z.string().nullish(),
  created_at: z.string().nullish(),
});

/**
 * A deployment (`GET /servers/{server}/sites/{site}/deployments/{deployment}`).
 * While the deployment runs only `id` and `status` are populated.
 */
export const ploiDeploymentSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  commit_hash: z.string().nullish(),
  commit_message: z.string().nullish(),
  source: z.string().nullish(),
  human_source: z.string().nullish(),
  created_at: z.string().nullish(),
  log_id: looseNumber.nullish(),
  log_url: z.string().nullish(),
});

/**
 * Response of `POST /servers/{server}/sites/{id}/deploy`. Unlike other single
 * resources this is NOT wrapped in `data`.
 */
export const ploiDeployResponseSchema = z.looseObject({
  message: z.string().optional(),
  deployment_id: z.string(),
});

/** Arguments for creating a site, in the camelCase used across OpsHub. */
export type PloiCreateSiteInput = {
  rootDomain: string;
  webDirectory: string;
  projectType?: string | null;
  systemUser?: string | null;
  webserverTemplate?: number | null;
  webhookUrl?: string | null;
};

export type PloiDeployResult = {
  message: string | null;
  deploymentId: string;
};

export const ploiMonitoredServersResponseSchema = z.looseObject({
  data: z.array(ploiMonitoredServerSchema),
});

export type PloiServer = z.infer<typeof ploiServerSchema>;
export type PloiServerStatistic = z.infer<typeof ploiServerStatisticSchema>;
export type PloiMonitoredServer = z.infer<typeof ploiMonitoredServerSchema>;
export type PloiSite = z.infer<typeof ploiSiteSchema>;
export type PloiWebserverTemplate = z.infer<typeof ploiWebserverTemplateSchema>;
export type PloiSystemUser = z.infer<typeof ploiSystemUserSchema>;
export type PloiDeployment = z.infer<typeof ploiDeploymentSchema>;

export type PloiPaginated<T> = {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};

/**
 * The Ploi surface OpsHub depends on. Both the real client and the mock
 * implement this, so callers never care which is wired up (PROJECT.md §5.1).
 *
 * The write surface is deliberately tiny and scoped to the milestone that
 * authorises it (AGENTS.md "Production safety"): `createSite` and `deploySite`
 * are the only two M3/M4 write endpoints. No delete/destroy/stop/reboot call
 * exists here on purpose.
 */
export interface PloiApi {
  listMonitoredServers(): Promise<PloiMonitoredServer[]>;
  getServer(id: number): Promise<PloiServer>;
  listSites(serverId: number): Promise<PloiSite[]>;
  getSite(serverId: number, siteId: number): Promise<PloiSite>;
  listWebserverTemplates(): Promise<PloiWebserverTemplate[]>;
  listSystemUsers(serverId: number): Promise<PloiSystemUser[]>;
  createSite(serverId: number, input: PloiCreateSiteInput): Promise<PloiSite>;
  deploySite(serverId: number, siteId: number): Promise<PloiDeployResult>;
  getDeployment(
    serverId: number,
    siteId: number,
    deploymentId: string,
  ): Promise<PloiDeployment>;
  listDeployments(
    serverId: number,
    siteId: number,
    options?: { perPage?: number },
  ): Promise<PloiDeployment[]>;
}
