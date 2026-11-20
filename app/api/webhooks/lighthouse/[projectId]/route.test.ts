import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { POST } from "./route";

const SECRET = "test-lighthouse-secret";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function sign(body: string): string {
  const digest = createHmac("sha256", SECRET).update(body).digest("hex");
  return `sha256=${digest}`;
}

function request(
  body: string,
  options: { signature?: string; projectId?: string } = {},
): Request {
  const projectId = options.projectId ?? PROJECT_ID;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.signature !== undefined) {
    headers["x-ops-hub-signature"] = options.signature;
  }
  return new Request(`http://localhost/api/webhooks/lighthouse/${projectId}`, {
    method: "POST",
    body,
    headers,
  });
}

const VALID_BODY = JSON.stringify({
  url: "https://example.test/",
  performance: 92,
  accessibility: 98,
  best_practices: 100,
  seo: 91,
});

const params = (projectId: string) => ({
  params: Promise.resolve({ projectId }),
});

describe("POST /api/webhooks/lighthouse/[projectId]", () => {
  it("rejects a request with no signature", async () => {
    const response = await POST(
      request(VALID_BODY, { projectId: "not-a-uuid" }),
      params("not-a-uuid"),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong signature", async () => {
    const response = await POST(
      request(VALID_BODY, { signature: sign("different body") }),
      params(PROJECT_ID),
    );
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON even with a valid signature", async () => {
    const response = await POST(
      request("not json", { signature: sign("not json") }),
      params(PROJECT_ID),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an unknown project id", async () => {
    const response = await POST(
      request(VALID_BODY, { signature: sign(VALID_BODY) }),
      params("not-a-uuid"),
    );
    expect(response.status).toBe(404);
  });

  it("rejects an unexpected payload shape", async () => {
    const body = JSON.stringify({ nope: true });
    const response = await POST(
      request(body, { signature: sign(body) }),
      params(PROJECT_ID),
    );
    expect(response.status).toBe(400);
  });
});
