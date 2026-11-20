"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createAlertRule } from "@/app/actions/alerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALERT_RULE_LABELS } from "@/lib/alerts/labels";
import { ALERT_RULE_TYPES } from "@/lib/validation";

const FLEET_WIDE = "fleet";

const ruleTypeItems = ALERT_RULE_TYPES.map((value) => ({
  value,
  label: ALERT_RULE_LABELS[value],
}));

const channelItems = [
  { value: "webhook", label: "Webhook (Slack/Google Chat)" },
  { value: "email", label: "Email (Resend)" },
];

/** Create an alert rule (M8). */
export function AlertRuleForm({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [ruleType, setRuleType] =
    useState<(typeof ALERT_RULE_TYPES)[number]>("server_disk_pct");
  const [projectId, setProjectId] = useState(FLEET_WIDE);
  const [threshold, setThreshold] = useState("80");
  const [channel, setChannel] = useState("webhook");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsThreshold = ruleType !== "deploy_failed";

  const projectItems = [
    { value: FLEET_WIDE, label: "Fleet-wide (all projects)" },
    ...projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await createAlertRule({
        ruleType,
        projectId: projectId === FLEET_WIDE ? "" : projectId,
        threshold: needsThreshold ? threshold : "",
        channel,
        destination,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Rule created.");
      setDestination("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ruleType">Rule type</Label>
        <Select
          items={ruleTypeItems}
          value={ruleType}
          onValueChange={(value) =>
            setRuleType(String(value) as (typeof ALERT_RULE_TYPES)[number])
          }
        >
          <SelectTrigger id="ruleType" className="w-full">
            <SelectValue placeholder="Select a rule type" />
          </SelectTrigger>
          <SelectContent>
            {ruleTypeItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ruleProject">Project</Label>
        <Select
          items={projectItems}
          value={projectId}
          onValueChange={(value) => setProjectId(String(value ?? FLEET_WIDE))}
        >
          <SelectTrigger id="ruleProject" className="w-full">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {projectItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsThreshold ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="threshold">
            Threshold{" "}
            <span className="text-muted-foreground">
              ({ruleType === "page_score_performance" ? "below" : "above"})
            </span>
          </Label>
          <Input
            id="threshold"
            type="number"
            step="any"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            required
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="channel">Channel</Label>
        <Select
          items={channelItems}
          value={channel}
          onValueChange={(value) => setChannel(String(value ?? "webhook"))}
        >
          <SelectTrigger id="channel" className="w-full">
            <SelectValue placeholder="Select a channel" />
          </SelectTrigger>
          <SelectContent>
            {channelItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="destination">
          Destination{" "}
          <span className="text-muted-foreground">
            (optional — defaults to SLACK_WEBHOOK_URL)
          </span>
        </Label>
        <Input
          id="destination"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder={
            channel === "email" ? "ops@example.com" : "https://hooks…"
          }
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create rule"}
        </Button>
      </div>
    </form>
  );
}
