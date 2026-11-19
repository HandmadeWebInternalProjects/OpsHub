import type { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { CircuitBreaker } from "./circuit-breaker";
import { PloiCircuitOpenError, PloiError } from "./errors";
import { TokenBucketRateLimiter } from "./rate-limiter";
import {
  ploiEnvelope,
  ploiMonitoredServersResponseSchema,
  ploiPaginated,
  ploiServerSchema,
  ploiSiteSchema,
  type PloiApi,
  type PloiMonitoredServer,
  type PloiServer,
  type PloiSite,
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
 * Typed, read-only client for the Ploi API.
 *
 * The M2 surface is intentionally read-only (PROJECT.md §5.1 + AGENTS.md
 * "Production safety"): it exposes only the GET endpoints M2 needs. Write
 * endpoints (create site, deploy) arrive with M3/M4 and must not be added here
 * without that milestone.
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

  private async request<S extends z.ZodType>(
    endpoint: string,
    schema: S,
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
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
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
