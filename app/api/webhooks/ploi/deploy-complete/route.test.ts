import { describe, expect, it } from "vitest";

import { POST } from "./route";

const SECRET = "test-webhook-secret";

function request(body: string, token?: string, event?: string): Request {
  const url = new URL("http://localhost/api/webhooks/ploi/deploy-complete");
  if (token !== undefined) url.searchParams.set("token", token);
  if (event !== undefined) url.searchParams.set("event", event);
  return new Request(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/webhooks/ploi/deploy-complete", () => {
  it("rejects a request with no token", async () => {
    const response = await POST(request("{}"));
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong token", async () => {
    const response = await POST(request("{}", "not-the-secret"));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON with the correct token", async () => {
    const response = await POST(request("not json", SECRET));
    expect(response.status).toBe(400);
  });

  it("rejects an unexpected payload shape", async () => {
    const response = await POST(
      request(JSON.stringify({ nope: true }), SECRET),
    );
    expect(response.status).toBe(400);
  });
});
