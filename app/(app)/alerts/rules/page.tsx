import { asc, eq, isNull } from "drizzle-orm";

import { AlertRuleForm } from "@/components/settings/alert-rule-form";
import { AlertRuleList } from "@/components/settings/alert-rule-list";
import {
  AlertRulesFilter,
  ALL_RULES,
  FLEET_WIDE,
} from "@/components/settings/alert-rules-filter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { alertRules, projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Rules tab: create and manage alert rules (fleet-wide and per project). */
export default async function AlertsRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project = ALL_RULES } = await searchParams;

  const [projectRows, ruleRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .orderBy(asc(projects.name)),
    db
      .select({
        id: alertRules.id,
        ruleType: alertRules.ruleType,
        projectName: projects.name,
        threshold: alertRules.threshold,
        channel: alertRules.channel,
        destination: alertRules.destination,
        enabled: alertRules.enabled,
      })
      .from(alertRules)
      .leftJoin(projects, eq(alertRules.projectId, projects.id))
      .where(
        project === FLEET_WIDE
          ? isNull(alertRules.projectId)
          : project === ALL_RULES
            ? undefined
            : eq(alertRules.projectId, project),
      )
      .orderBy(asc(alertRules.createdAt)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Create a rule</CardTitle>
          <CardDescription>
            Fleet-wide (no project) or scoped to one project. Webhook deliveries
            post a JSON text payload to a Slack- or Google Chat-compatible
            incoming webhook.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertRuleForm projects={projectRows} />
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Rules</CardTitle>
          <AlertRulesFilter projects={projectRows} value={project} />
        </CardHeader>
        <CardContent>
          <AlertRuleList rules={ruleRows} />
        </CardContent>
      </Card>
    </div>
  );
}
