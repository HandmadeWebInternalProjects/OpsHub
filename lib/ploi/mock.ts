import type {
  PloiApi,
  PloiMonitoredServer,
  PloiServer,
  PloiSite,
} from "./types";

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

const MONITORED: PloiMonitoredServer[] = [
  {
    id: 1001,
    name: "mock-web-01",
    ip: "203.0.113.10",
    url: "https://ploi.io/panel/servers/1001",
    statistics: [
      {
        cpu: "12.4",
        ram: "41.10",
        disk: "63",
        load_average: "0.42",
        date: "2026-11-20 09:00:00",
      },
      {
        cpu: "15.1",
        ram: "42.30",
        disk: "63",
        load_average: "0.55",
        date: "2026-11-20 09:05:00",
      },
    ],
  },
  {
    id: 1002,
    name: "mock-web-02",
    ip: "203.0.113.20",
    url: "https://ploi.io/panel/servers/1002",
    statistics: [
      {
        cpu: "4.0",
        ram: "22.00",
        disk: "38",
        load_average: "0.10",
        date: "2026-11-20 09:05:00",
      },
    ],
  },
];

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
  async listMonitoredServers(): Promise<PloiMonitoredServer[]> {
    return structuredClone(MONITORED);
  }

  async getServer(id: number): Promise<PloiServer> {
    const server = SERVERS.find((item) => item.id === id);
    if (!server) throw new Error(`Mock Ploi: no server with id ${id}`);
    return structuredClone(server);
  }

  async listSites(serverId: number): Promise<PloiSite[]> {
    return structuredClone(SITES[serverId] ?? []);
  }

  async getSite(serverId: number, siteId: number): Promise<PloiSite> {
    const site = (SITES[serverId] ?? []).find((item) => item.id === siteId);
    if (!site) {
      throw new Error(`Mock Ploi: no site ${siteId} on server ${serverId}`);
    }
    return structuredClone(site);
  }
}
