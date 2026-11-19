import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { PloiClient } from "./client";
import type { PloiClientOptions } from "./client";
import { PloiCircuitOpenError, PloiError } from "./errors";
import { TokenBucketRateLimiter } from "./rate-limiter";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeFetch(
  impl: (input: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return vi.fn(impl) as unknown as typeof fetch;
}

function clientWith(
  fetchImpl: typeof fetch,
  extra: Partial<PloiClientOptions> = {},
): PloiClient {
  return new PloiClient({
    token: "test-token",
    baseUrl: "https://ploi.test/api",
    fetchImpl,
    rateLimiter: new TokenBucketRateLimiter(1000, 1000),
    ...extra,
  });
}

describe("PloiClient", () => {
  it("parses monitored servers and sends a bearer token", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({
        data: [
          {
            id: 1,
            name: "s1",
            ip: "1.2.3.4",
            url: "https://ploi.io/panel/servers/1",
            statistics: [
              {
                cpu: "1",
                ram: "2",
                disk: "3",
                load_average: "0.1",
                date: "2026-11-20 09:00:00",
              },
            ],
          },
        ],
      }),
    );

    const servers = await clientWith(fetchImpl).listMonitoredServers();
    expect(servers).toHaveLength(1);
    expect(servers[0]?.name).toBe("s1");

    const calls = (fetchImpl as unknown as Mock).mock.calls;
    expect(calls[0]?.[0]).toBe("https://ploi.test/api/servers/monitored");
    const init = calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token",
    );
  });

  it("requests the server-scoped site path", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({ data: { id: 7, server_id: 1, domain: "x.com" } }),
    );

    const site = await clientWith(fetchImpl).getSite(1, 7);
    expect(site.domain).toBe("x.com");

    const calls = (fetchImpl as unknown as Mock).mock.calls;
    expect(calls[0]?.[0]).toBe("https://ploi.test/api/servers/1/sites/7");
  });

  it("throws PloiError carrying the HTTP status", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({ message: "nope" }, 404),
    );
    await expect(clientWith(fetchImpl).getServer(1)).rejects.toBeInstanceOf(
      PloiError,
    );
    await expect(clientWith(fetchImpl).getServer(1)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws PloiError when the response shape is invalid", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({ data: { id: "not-a-number" } }),
    );
    await expect(clientWith(fetchImpl).getServer(1)).rejects.toBeInstanceOf(
      PloiError,
    );
  });

  it("throws PloiError(status 0) on network failure", async () => {
    const fetchImpl = makeFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(clientWith(fetchImpl).getServer(1)).rejects.toMatchObject({
      status: 0,
    });
  });

  it("opens the circuit after 3 consecutive server errors", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({ message: "boom" }, 500),
    );
    const client = clientWith(fetchImpl);

    for (let i = 0; i < 3; i += 1) {
      await expect(client.listMonitoredServers()).rejects.toBeInstanceOf(
        PloiError,
      );
    }

    await expect(client.listMonitoredServers()).rejects.toBeInstanceOf(
      PloiCircuitOpenError,
    );
    // The 4th call is blocked by the breaker and never reaches fetch.
    expect((fetchImpl as unknown as Mock).mock.calls).toHaveLength(3);
  });

  it("creates a site with the documented body and server-scoped path", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({
        data: { id: 42, server_id: 1, domain: "new.example.com" },
      }),
    );

    const site = await clientWith(fetchImpl).createSite(1, {
      rootDomain: "new.example.com",
      webDirectory: "/public",
      webserverTemplate: 3,
    });
    expect(site.id).toBe(42);

    const calls = (fetchImpl as unknown as Mock).mock.calls;
    expect(calls[0]?.[0]).toBe("https://ploi.test/api/servers/1/sites");
    const init = calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      root_domain: "new.example.com",
      web_directory: "/public",
      webserver_template: 3,
    });
  });

  it("posts to the server-scoped deploy path and returns the deployment id", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({ message: "queued", deployment_id: "dep-1" }),
    );

    const result = await clientWith(fetchImpl).deploySite(1, 7);
    expect(result.deploymentId).toBe("dep-1");

    const calls = (fetchImpl as unknown as Mock).mock.calls;
    expect(calls[0]?.[0]).toBe(
      "https://ploi.test/api/servers/1/sites/7/deploy",
    );
    expect((calls[0]?.[1] as RequestInit).method).toBe("POST");
  });

  it("reads a deployment status", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({ data: { id: "dep-1", status: "deploying" } }),
    );

    const deployment = await clientWith(fetchImpl).getDeployment(1, 7, "dep-1");
    expect(deployment.status).toBe("deploying");

    const calls = (fetchImpl as unknown as Mock).mock.calls;
    expect(calls[0]?.[0]).toBe(
      "https://ploi.test/api/servers/1/sites/7/deployments/dep-1",
    );
  });

  it("lists webserver templates", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({
        data: [{ id: 1, label: "Magento webserver" }],
        meta: { current_page: 1, last_page: 1, per_page: 15, total: 1 },
      }),
    );

    const templates = await clientWith(fetchImpl).listWebserverTemplates();
    expect(templates).toEqual([{ id: 1, label: "Magento webserver" }]);

    const calls = (fetchImpl as unknown as Mock).mock.calls;
    expect(calls[0]?.[0]).toBe("https://ploi.test/api/webserver-templates");
  });
});
