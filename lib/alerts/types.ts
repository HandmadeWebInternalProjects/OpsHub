import type { alertChannel, alertRuleType } from "@/lib/db/schema";

/** Every value allowed in the `alert_rules.rule_type` enum (PROJECT.md §4). */
export type AlertRuleType = (typeof alertRuleType.enumValues)[number];

export type AlertChannel = (typeof alertChannel.enumValues)[number];

/** One outbound alert delivery (webhook or email). */
export type AlertDeliveryInput = {
  channel: AlertChannel;
  /** Per-rule destination; null falls back to a configured default. */
  destination: string | null;
  title: string;
  detail: string;
};

/** A delivery transport for fired alerts. Mocked when `USE_MOCKS=true`. */
export interface AlertDelivery {
  send(input: AlertDeliveryInput): Promise<void>;
}
