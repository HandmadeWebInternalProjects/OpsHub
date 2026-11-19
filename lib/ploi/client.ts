import type { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { CircuitBreaker } from "./circuit-breaker";
import { PloiCircuitOpenError, PloiError } from "./errors";
import { TokenBucketRateLimiter } from "./rate-limiter";
import {
  ploiDeployResponseSchema,
  ploiDeploymentSchema,
  ploiEnvelope,
  ploiMonitoredServersResponseSchema,
  ploiPaginated,
  ploiServerSchema,
  ploiSiteSchema,
  ploiSystemUserSchema,
  ploiWebserverTemplateSchema,
  type PloiApi,
  type PloiCreateSiteInput,
  type PloiDeployResult,
  type PloiDeployment,
  type PloiMonitoredServer,
  type PloiServer,
  type PloiSite,
  type PloiSystemUser,
  type PloiWebserverTemplate,
} from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

/** Statuses that indicate Ploi (or the network) is unhealthy, not a bad request. */
function tripsBreaker(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

export type PloiClientOptions = {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  rateLimiter?: TokenBucketRateLimiter;
  circuitBreaker?: CircuitBreaker;
  timeoutMs?: number;
};

/**
 * Typed client for the Ploi API.
 *
 * The GET surface is the M2 read layer. The only writes are `createSite` and
 * `deploySite` — the exact endpoints M3 authorises (PROJECT.md §5.1 + AGENTS.md
 * "Production safety"). Critically, there is NO delete/destroy/stop/suspend/
 * reboot/scale/terminate call here, and none may be added without a milestone
 * that explicitly authorises it.
 */
export class PloiClient implements PloiApi {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly rateLimiter: TokenBucketRateLimiter;
  private readonly breaker: CircuitBreaker;
  private readonly timeoutMs: number;

  constructor(options: PloiClientOptions) {
    if (!options.token) {
      throw new Error("PloiClient requires an API token.");
    }
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? env.PLOI_API_BASE).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.rateLimiter = options.rateLimiter ?? new TokenBucketRateLimiter(5, 5);
    this.breaker = options.circuitBreaker ?? new CircuitBreaker(3, 60_000);
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async listMonitoredServers(): Promise<PloiMonitoredServer[]> {
    const parsed = await this.request(
      "/servers/monitored",
      ploiMonitoredServersResponseSchema,
    );
    return parsed.data;
  }

  async getServer(id: number): Promise<PloiServer> {
    const parsed = await this.request(
      `/servers/${id}`,
      ploiEnvelope(ploiServerSchema),
    );
    return parsed.data;
  }

  async listSites(serverId: number): Promise<PloiSite[]> {
    const parsed = await this.request(
      `/servers/${serverId}/sites`,
      ploiPaginated(ploiSiteSchema),
    );
    return parsed.data;
  }

  async getSite(serverId: number, siteId: number): Promise<PloiSite> {
    // PROJECT.md §5.1 lists `GET /sites/{id}`; the real endpoint is
    // server-scoped: `GET /servers/{id}/sites/{site}` (verified 2026-11-20).
    const parsed = await this.request(
      `/servers/${serverId}/sites/${siteId}`,
      ploiEnvelope(ploiSiteSchema),
    );
    return parsed.data;
  }

  async listWebserverTemplates(): Promise<PloiWebserverTemplate[]> {
    const parsed = await this.request(
      "/webserver-templates",
      ploiPaginated(ploiWebserverTemplateSchema),
    );
    return parsed.data;
  }

  async listSystemUsers(serverId: number): Promise<PloiSystemUser[]> {
    const parsed = await this.request(
      `/servers/${serverId}/system-users`,
      ploiPaginated(ploiSystemUserSchema),
    );
    return parsed.data;
  }

  /**
   * Create a site (`POST /servers/{server}/sites`). WRITE — authorised by M3.
   * Only the documented create-site fields are ever sent.
   */
  async createSite(
    serverId: number,
    input: PloiCreateSiteInput,
  ): Promise<PloiSite> {
    const body: Record<string, unknown> = {
      root_domain: input.rootDomain,
      web_directory: input.webDirectory,
    };
    if (input.projectType) body.project_type = input.projectType;
    if (input.systemUser) body.system_user = input.systemUser;
    if (input.webserverTemplate != null) {
      body.webserver_template = input.webserverTemplate;
    }
    if (input.webhookUrl) body.webhook_url = input.webhookUrl;

    const parsed = await this.request(
      `/servers/${serverId}/sites`,
      ploiEnvelope(ploiSiteSchema),
      { method: "POST", body },
    );
    return parsed.data;
  }

  /**
   * Trigger a deployment (`POST /servers/{server}/sites/{id}/deploy`). WRITE —
   * authorised by M3/M4. Returns the `deployment_id` to poll.
   */
  async deploySite(
    serverId: number,
    siteId: number,
  ): Promise<PloiDeployResult> {
    const parsed = await this.request(
      `/servers/${serverId}/sites/${siteId}/deploy`,
      ploiDeployResponseSchema,
      { method: "POST" },
    );
    return {
      message: parsed.message ?? null,
      deploymentId: parsed.deployment_id,
    };
  }

  async getDeployment(
    serverId: number,
    siteId: number,
    deploymentId: string,
  ): Promise<PloiDeployment> {
    const parsed = await this.request(
      `/servers/${serverId}/sites/${siteId}/deployments/${deploymentId}`,
      ploiEnvelope(ploiDeploymentSchema),
    );
    return parsed.data;
  }

  private async request<S extends z.ZodType>(
    endpoint: string,
    schema: S,
    init: { method?: "GET" | "POST"; body?: unknown } = {},
  ): Promise<z.infer<S>> {
    if (!this.breaker.allowRequest()) {
      throw new PloiCircuitOpenError(this.breaker.retryAfterMs());
    }

    await this.rateLimiter.acquire();

    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch {
      // Network failure / timeout. The token is never logged.
      this.breaker.recordFailure();
      logger.warn({ endpoint }, "Ploi request failed (network)");
      throw new PloiError("Could not reach the Ploi API.", {
        status: 0,
        body: null,
        endpoint,
      });
    } finally {
      clearTimeout(timeout);
    }

    const body = await readJson(response);

    if (!response.ok) {
      if (tripsBreaker(response.status)) {
        this.breaker.recordFailure();
      }
      logger.warn(
        { endpoint, status: response.status },
        "Ploi request returned an error status",
      );
      throw new PloiError(`Ploi API returned HTTP ${response.status}.`, {
        status: response.status,
        body,
        endpoint,
      });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      this.breaker.recordFailure();
      logger.warn({ endpoint }, "Ploi response failed schema validation");
      throw new PloiError("Ploi API returned an unexpected response shape.", {
        status: response.status,
        body,
        endpoint,
      });
    }

    this.breaker.recordSuccess();
    return parsed.data;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
