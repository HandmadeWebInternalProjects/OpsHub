"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteAlertRule, setAlertRuleEnabled } from "@/app/actions/alerts";
import { Button } from "@/components/ui/button";
import { alertRuleLabel } from "@/lib/alerts/labels";
import type { AlertRuleType } from "@/lib/alerts/types";

export type AlertRuleRow = {
  id: string;
  ruleType: AlertRuleType;
  projectName: string | null;
  threshold: string | null;
  channel: string;
  destination: string | null;
  enabled: boolean;
};

export function AlertRuleList({ rules }: { rules: AlertRuleRow[] }) {
  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">No alert rules yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rules.map((rule) => (
        <AlertRuleItem key={rule.id} rule={rule} />
      ))}
    </ul>
  );
}

function AlertRuleItem({ rule }: { rule: AlertRuleRow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const scope = rule.projectName ?? "Fleet-wide";
  const bound =
    rule.threshold != null
      ? `${rule.ruleType === "page_score_performance" ? "<" : ">"} ${rule.threshold}`
      : "";

  function onToggle() {
    setError(null);
    startTransition(async () => {
      const result = await setAlertRuleEnabled(rule.id, !rule.enabled);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAlertRule(rule.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li
      data-rule-id={rule.id}
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">
          {alertRuleLabel(rule.ruleType)}
          {bound ? ` ${bound}` : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          {scope} · {rule.channel}
          {rule.destination ? ` → ${rule.destination}` : ""}
          {rule.enabled ? "" : " · disabled"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggle}
          disabled={pending}
        >
          {rule.enabled ? "Disable" : "Enable"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDelete}
          disabled={pending}
        >
          Delete
        </Button>
      </div>
      {error ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
