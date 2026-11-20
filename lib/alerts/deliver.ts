import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import type { AlertDelivery, AlertDeliveryInput } from "./types";

/**
 * The JSON body sent to an incoming webhook. `{ text }` is understood by Slack
 * and Google Chat incoming webhooks alike, so one shape covers both (PROJECT.md
 * §6, M8). Returns a plain object so it can be unit-tested without a network.
 */
export function buildWebhookPayload(
  title: string,
  detail: string,
): { text: string } {
  return { text: `${title}\n\n${detail}` };
}

/** Real delivery: webhook via `fetch`, email via the Resend SDK. */
export class HttpAlertDelivery implements AlertDelivery {
  async send(input: AlertDeliveryInput): Promise<void> {
    if (input.channel === "email") {
      await this.sendEmail(input);
      return;
    }
    await this.sendWebhook(input);
  }

  private async sendWebhook(input: AlertDeliveryInput): Promise<void> {
    const url = input.destination ?? env.SLACK_WEBHOOK_URL;
    if (!url) {
      throw new Error(
        "No webhook destination configured (set the rule's destination or SLACK_WEBHOOK_URL).",
      );
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildWebhookPayload(input.title, input.detail)),
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery failed with HTTP ${response.status}.`);
    }
  }

  private async sendEmail(input: AlertDeliveryInput): Promise<void> {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY is not configured; cannot deliver alert email.",
      );
    }
    if (!input.destination) {
      throw new Error("No email destination configured for this rule.");
    }

    // Imported lazily so the app never needs the SDK configured up front.
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: env.ALERT_EMAIL_FROM,
      to: input.destination,
      subject: input.title,
      text: input.detail,
    });

    if (error) {
      throw new Error(`Resend rejected the alert email: ${error.message}`);
    }
  }
}

/**
 * Local/acceptance delivery (PROJECT.md §10.3): records the alert as delivered
 * without touching the network, so rules fire end-to-end under `USE_MOCKS=true`.
 */
export class MockAlertDelivery implements AlertDelivery {
  async send(input: AlertDeliveryInput): Promise<void> {
    logger.info(
      {
        channel: input.channel,
        destination: input.destination ?? "(env default)",
        title: input.title,
      },
      "mock alert delivery",
    );
  }
}

/** Resolve the delivery transport for the current environment. */
export function getAlertDelivery(): AlertDelivery {
  return env.USE_MOCKS ? new MockAlertDelivery() : new HttpAlertDelivery();
}
