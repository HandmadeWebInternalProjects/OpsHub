import type {
  PloiApi,
  PloiCreateSiteInput,
  PloiDeployResult,
  PloiDeployment,
  PloiMonitoredServer,
  PloiServer,
  PloiServerStatistic,
  PloiSite,
  PloiSystemUser,
  PloiWebserverTemplate,
} from "./types";

const WEBSERVER_TEMPLATES: PloiWebserverTemplate[] = [
  {
    id: 1,
    label: "Default NGINX (Ploi)",
    content: "# managed by Ploi",
    created_at: "2025-01-01 00:00:00",
  },
  {
    id: 2,
    label: "Astro static site",
    content: "# static file server",
    created_at: "2025-01-01 00:00:00",
  },
];

const SYSTEM_USERS: Record<number, PloiSystemUser[]> = {
  1001: [
    {
      id: 1,
      name: "ploi",
      root: "/home/ploi",
      created_at: "2025-01-01 00:00:00",
    },
  ],
  1002: [
    {
      id: 2,
      name: "ploi",
      root: "/home/ploi",
      created_at: "2025-01-01 00:00:00",
    },
  ],
};

/**
 * Deterministic Ploi fixture used when `USE_MOCKS=true` (PROJECT.md §10.3) so
 * the app runs locally with no real credentials. Mirrors the verified response
 * shapes in types.ts.
 */
const SERVERS: PloiServer[] = [
  {
    id: 1001,
    type: "server",
    name: "mock-web-01",
    ip_address: "203.0.113.10",
    php_version: "8.3",
    php_cli_version: "8.3",
    installed_php_versions: ["8.3", "8.4"],
    mysql_version: "8.0",
    sites_count: 2,
    status: "Server active",
    status_id: 0,
    monitoring: true,
    created_at: "2025-01-15 09:00:00",
  },
  {
    id: 1002,
    type: "server",
    name: "mock-web-02",
    ip_address: "203.0.113.20",
    php_version: "8.3",
    php_cli_version: "8.3",
    installed_php_versions: ["8.3"],
    mysql_version: "8.0",
    sites_count: 1,
    status: "Server active",
    status_id: 0,
    monitoring: true,
    created_at: "2025-02-02 11:30:00",
  },
];

const MONITORED_IDS: Record<
  number,
  { name: string; ip: string; seed: number }
> = {
  1001: { name: "mock-web-01", ip: "203.0.113.10", seed: 0 },
  1002: { name: "mock-web-02", ip: "203.0.113.20", seed: 1 },
};

/**
 * Recent monitoring datapoints ending at the current minute, so each worker
 * cadence produces a fresh (slightly different) snapshot and the M5 sparklines
 * actually trend. Values stay in realistic percentage ranges and each server
 * gets a distinct baseline.
 */
function recentStatistics(seed: number, points = 3): PloiServerStatistic[] {
  const minute = Math.floor(Date.now() / 60_000);
  const disk: Record<string, number> = {};
  const cpu: Record<string, number> = {};
  const ram: Record<string, number> = {};
  for (let i = points - 1; i >= 0; i -= 1) {
    const at = minute - i * 5;
    const wobble = at % 5;
    const key = new Date(at * 60_000).toISOString().slice(11, 16);
    disk[key] = 58 + seed * 5;
    cpu[key] = Number((8 + seed * 6 + wobble).toFixed(1));
    ram[key] = Number((34 + seed * 8 + wobble * 0.6).toFixed(2));
  }

  // Mirror the live `GET /servers/monitored` shape: named series, and no Load
  // series (the live endpoint does not expose one).
  return [
    { name: "Disk", data: disk },
    { name: "CPU", data: cpu },
    { name: "RAM", data: ram },
  ];
}

const SITES: Record<number, PloiSite[]> = {
  1001: [
    {
      id: 501,
      server_id: 1001,
      status: "active",
      domain: "acme.example.com",
      project_type: "custom",
      web_directory: "/public",
      project_root: "/",
      system_user: "ploi",
      php_version: "8.3",
      has_repository: true,
      deployment_type: "default",
      quick_deploy: true,
      last_deploy_at: "2026-11-19 16:20:00",
      created_at: "2025-03-01 10:00:00",
    },
    {
      id: 502,
      server_id: 1001,
      status: "active",
      domain: "globex.example.com",
      project_type: "custom",
      web_directory: "/public",
      project_root: "/",
      system_user: "ploi",
      php_version: "8.3",
      has_repository: true,
      deployment_type: "default",
      quick_deploy: true,
      last_deploy_at: null,
      created_at: "2025-04-12 08:45:00",
    },
  ],
  1002: [
    {
      id: 503,
      server_id: 1002,
      status: "active",
      domain: "initech.example.com",
      project_type: "custom",
      web_directory: "/public",
      project_root: "/",
      system_user: "ploi",
      php_version: "8.3",
      has_repository: false,
      deployment_type: "default",
      quick_deploy: false,
      last_deploy_at: null,
      created_at: "2025-05-20 14:00:00",
    },
  ],
};

export class MockPloiClient implements PloiApi {
  /** Mutable per-instance state so a mock provisioning run behaves like Ploi. */
  private readonly sites: Record<number, PloiSite[]> = structuredClone(SITES);
  private readonly deployments = new Map<string, PloiDeployment>();
  /** Per-site deployment history, newest first (mirrors the list endpoint). */
  private readonly deploymentHistory = new Map<number, PloiDeployment[]>();
  private nextSiteId = 900;
  private nextDeploymentSeq = 1;

  async listMonitoredServers(): Promise<PloiMonitoredServer[]> {
    return Object.entries(MONITORED_IDS).map(([id, meta]) => ({
      id: Number(id),
      name: meta.name,
      ip: meta.ip,
      url: `https://ploi.io/panel/servers/${id}`,
      statistics: recentStatistics(meta.seed),
    }));
  }

  async getServer(id: number): Promise<PloiServer> {
    const server = SERVERS.find((item) => item.id === id);
    if (!server) throw new Error(`Mock Ploi: no server with id ${id}`);
    return structuredClone(server);
  }

  async listSites(serverId: number): Promise<PloiSite[]> {
    return structuredClone(this.sites[serverId] ?? []);
  }

  async getSite(serverId: number, siteId: number): Promise<PloiSite> {
    const site = (this.sites[serverId] ?? []).find(
      (item) => item.id === siteId,
    );
    if (!site) {
      throw new Error(`Mock Ploi: no site ${siteId} on server ${serverId}`);
    }
    return structuredClone(site);
  }

  async listWebserverTemplates(): Promise<PloiWebserverTemplate[]> {
    return structuredClone(WEBSERVER_TEMPLATES);
  }

  async listSystemUsers(serverId: number): Promise<PloiSystemUser[]> {
    return structuredClone(SYSTEM_USERS[serverId] ?? []);
  }

  /** Mirrors `POST /servers/{server}/sites`; the mock site is immediately active. */
  async createSite(
    serverId: number,
    input: PloiCreateSiteInput,
  ): Promise<PloiSite> {
    const site: PloiSite = {
      id: this.nextSiteId++,
      server_id: serverId,
      status: "active",
      domain: input.rootDomain,
      deploy_script: false,
      web_directory: input.webDirectory,
      project_type: input.projectType ?? null,
      project_root: "/",
      last_deploy_at: null,
      system_user: input.systemUser ?? "ploi",
      php_version: "8.3",
      health_url: null,
      has_repository: true,
      deployment_type: "default",
      quick_deploy: false,
      created_at: mockTimestamp(),
    };
    this.sites[serverId] = [...(this.sites[serverId] ?? []), site];
    return structuredClone(site);
  }

  /** Mirrors `POST /servers/{server}/sites/{id}/deploy`; returns a deployment id. */
  async deploySite(
    serverId: number,
    siteId: number,
  ): Promise<PloiDeployResult> {
    const site = (this.sites[serverId] ?? []).find(
      (item) => item.id === siteId,
    );
    if (!site) {
      throw new Error(`Mock Ploi: no site ${siteId} on server ${serverId}`);
    }
    // Unique per process so a redeploy in a fresh run can never collide with a
    // leftover `external_id` from an earlier session (deploy_events dedupes on it).
    const id = `mock-deploy-${Date.now().toString(36)}-${this.nextDeploymentSeq++}`;
    const deployment: PloiDeployment = {
      id,
      status: "success",
      commit_hash: "mock-commit",
      commit_message: `Mock deploy of ${site.domain}`,
      source: "api",
      human_source: "API",
      created_at: mockTimestamp(),
      log_id: null,
      log_url: null,
    };
    this.deployments.set(id, deployment);
    this.deploymentHistory.set(siteId, [
      deployment,
      ...(this.deploymentHistory.get(siteId) ?? []),
    ]);
    return {
      message: `Site ${site.domain} has been queued for deployment`,
      deploymentId: id,
    };
  }

  async getDeployment(
    serverId: number,
    siteId: number,
    deploymentId: string,
  ): Promise<PloiDeployment> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(
        `Mock Ploi: no deployment ${deploymentId} on site ${siteId} (server ${serverId})`,
      );
    }
    return structuredClone(deployment);
  }

  async listDeployments(
    serverId: number,
    siteId: number,
  ): Promise<PloiDeployment[]> {
    void serverId;
    return structuredClone(this.deploymentHistory.get(siteId) ?? []);
  }
}

function mockTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
