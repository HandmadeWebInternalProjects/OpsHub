import { env } from "@/lib/env";

import { PloiClient } from "./client";
import { MockPloiClient } from "./mock";
import type { PloiApi } from "./types";

/**
 * The rate limiter and circuit breaker must be shared across every request, so
 * the client is a process-wide singleton (mirrors lib/db/index.ts).
 */
const globalForPloi = globalThis as unknown as { ploiClient?: PloiApi };

/**
 * Return the Ploi client for the current environment: the mock adapter when
 * `USE_MOCKS=true`, otherwise the real read-only client (PROJECT.md §10.3).
 */
export function getPloiClient(): PloiApi {
  if (globalForPloi.ploiClient) return globalForPloi.ploiClient;

  const client: PloiApi = env.USE_MOCKS
    ? new MockPloiClient()
    : createLiveClient();

  if (env.NODE_ENV !== "production") {
    globalForPloi.ploiClient = client;
  }
  return client;
}

function createLiveClient(): PloiApi {
  if (!env.PLOI_API_TOKEN) {
    throw new Error(
      "PLOI_API_TOKEN is required when USE_MOCKS is not enabled.",
    );
  }
  return new PloiClient({
    token: env.PLOI_API_TOKEN,
    baseUrl: env.PLOI_API_BASE,
  });
}

export { PloiClient } from "./client";
export { MockPloiClient } from "./mock";
export { PloiError, PloiCircuitOpenError } from "./errors";
export { CircuitBreaker } from "./circuit-breaker";
export { TokenBucketRateLimiter } from "./rate-limiter";
export {
  ploiServerSchema,
  ploiSiteSchema,
  ploiMonitoredServerSchema,
} from "./types";
export type {
  PloiApi,
  PloiMonitoredServer,
  PloiServer,
  PloiServerStatistic,
  PloiSite,
} from "./types";
