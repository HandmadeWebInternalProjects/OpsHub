import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { AlertRuleForm } from "@/components/settings/alert-rule-form";
import { AlertRuleList } from "@/components/settings/alert-rule-list";
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

/** Project Alert rules tab: rules scoped to this project. */
export default async function ProjectAlertsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    notFound();
  }

  const rules = await db
    .select({
      id: alertRules.id,
      ruleType: alertRules.ruleType,
      threshold: alertRules.threshold,
      channel: alertRules.channel,
      destination: alertRules.destination,
      enabled: alertRules.enabled,
    })
    .from(alertRules)
    .where(eq(alertRules.projectId, project.id))
    .orderBy(asc(alertRules.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Alert rules</CardTitle>
          <CardDescription>
            Rules scoped to this project. Fleet-wide rules live under Alerts →
            Rules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertRuleList
            rules={rules.map((rule) => ({
              ...rule,
              projectName: project.name,
            }))}
          />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Add a rule</CardTitle>
        </CardHeader>
        <CardContent>
          <AlertRuleForm projects={[]} fixedProjectId={project.id} />
        </CardContent>
      </Card>
    </div>
  );
}
