import { afterEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/lib/db/schema";

import { HttpAuditProvider } from "./http-provider";

const project = { id: "p1" } as unknown as Project;

function provider(): HttpAuditProvider {
  return new HttpAuditProvider({
    type: "payload",
    cmsUrl: "https://cms.example.com/",
    token: "secret-token",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpAuditProvider", () => {
  it("maps a valid response to AuditEvent[]", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [
            {
              id: "evt-1",
              type: "login_failed",
              actor: "bad@example.com",
              ip: "203.0.113.1",
              summary: "Failed login",
              occurredAt: "2026-11-20T12:00:00.000Z",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const events = await provider().listAuditEvents(project, null);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      externalId: "evt-1",
      eventType: "login_failed",
      actor: "bad@example.com",
      ipAddress: "203.0.113.1",
    });
    expect(events[0]?.occurredAt).toBeInstanceOf(Date);
  });

  it("sends the bearer token, limit and since params", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ events: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const since = new Date("2026-11-19T00:00:00.000Z");
    await provider().listAuditEvents(project, since);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/opshub/audit");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("since")).toBe(since.toISOString());
    expect(init.headers).toMatchObject({
      authorization: "Bearer secret-token",
    });
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );

    await expect(provider().listAuditEvents(project, null)).rejects.toThrow(
      /returned 500/,
    );
  });

  it("throws on an unexpected response shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ nope: true }), { status: 200 }),
        ),
    );

    await expect(provider().listAuditEvents(project, null)).rejects.toThrow(
      /Unexpected audit response shape/,
    );
  });
});
