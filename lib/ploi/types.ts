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

/** One datapoint in `GET /servers/monitored`. */
export const ploiServerStatisticSchema = z.looseObject({
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
  deploy_script: z.boolean().nullish(),
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

export const ploiMonitoredServersResponseSchema = z.looseObject({
  data: z.array(ploiMonitoredServerSchema),
});

export type PloiServer = z.infer<typeof ploiServerSchema>;
export type PloiServerStatistic = z.infer<typeof ploiServerStatisticSchema>;
export type PloiMonitoredServer = z.infer<typeof ploiMonitoredServerSchema>;
export type PloiSite = z.infer<typeof ploiSiteSchema>;

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
 * The read surface OpsHub depends on. Both the real client and the mock
 * implement this, so callers never care which is wired up (PROJECT.md §5.1).
 */
export interface PloiApi {
  listMonitoredServers(): Promise<PloiMonitoredServer[]>;
  getServer(id: number): Promise<PloiServer>;
  listSites(serverId: number): Promise<PloiSite[]>;
  getSite(serverId: number, siteId: number): Promise<PloiSite>;
}
