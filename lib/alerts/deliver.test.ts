import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildWebhookPayload,
  HttpAlertDelivery,
  MockAlertDelivery,
} from "./deliver";

describe("buildWebhookPayload", () => {
  it("builds a Slack/Google Chat compatible text body", () => {
    expect(buildWebhookPayload("Title", "Detail")).toEqual({
      text: "Title\n\nDetail",
    });
  });
});

describe("HttpAlertDelivery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the JSON text payload to the rule destination", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new HttpAlertDelivery().send({
      channel: "webhook",
      destination: "https://hooks.example.test/x",
      title: "Title",
      detail: "Detail",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example.test/x");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ text: "Title\n\nDetail" });
  });

  it("throws when no webhook destination is configured", async () => {
    await expect(
      new HttpAlertDelivery().send({
        channel: "webhook",
        destination: null,
        title: "Title",
        detail: "Detail",
      }),
    ).rejects.toThrow(/No webhook destination/);
  });

  it("throws when the webhook responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );
    await expect(
      new HttpAlertDelivery().send({
        channel: "webhook",
        destination: "https://hooks.example.test/x",
        title: "Title",
        detail: "Detail",
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("requires RESEND_API_KEY for email delivery", async () => {
    await expect(
      new HttpAlertDelivery().send({
        channel: "email",
        destination: "ops@example.com",
        title: "Title",
        detail: "Detail",
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("MockAlertDelivery", () => {
  it("resolves without a network call", async () => {
    await expect(
      new MockAlertDelivery().send({
        channel: "webhook",
        destination: null,
        title: "Title",
        detail: "Detail",
      }),
    ).resolves.toBeUndefined();
  });
});
