import type { AlertRuleType } from "./types";

/** Human labels for the rule types (PROJECT.md §4 / §6, M8). */
export const ALERT_RULE_LABELS: Record<AlertRuleType, string> = {
  server_disk_pct: "Server disk %",
  page_score_performance: "Page score (performance)",
  deploy_failed: "Deploy failed",
  audit_login_failed_count: "Failed logins (1h)",
};

export function alertRuleLabel(ruleType: AlertRuleType): string {
  return ALERT_RULE_LABELS[ruleType] ?? ruleType;
}
