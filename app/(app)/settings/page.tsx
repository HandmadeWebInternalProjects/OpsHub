import { asc, eq, ne } from "drizzle-orm";

import { AlertRuleForm } from "@/components/settings/alert-rule-form";
import { AlertRuleList } from "@/components/settings/alert-rule-list";
import { AuditSyncButton } from "@/components/settings/audit-sync-button";
import { CmsTokenForm } from "@/components/settings/cms-token-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { alertRules, projects } from "@/lib/db/schema";
import {
  cmsTokenKey,
  listIntegrationConfigKeys,
} from "@/lib/integration-config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [projectRows, configuredKeys, ruleRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        cmsType: projects.cmsType,
        cmsUrl: projects.cmsUrl,
      })
      .from(projects)
      .where(ne(projects.status, "archived"))
      .orderBy(asc(projects.name)),
    listIntegrationConfigKeys(),
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
      .orderBy(asc(alertRules.createdAt)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Integration configuration. Secrets are encrypted at rest and never
          shown again once saved.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Content-backend audit sync</CardTitle>
          <CardDescription>
            OpsHub pulls recent audit events from each project’s content backend
            every 15 minutes. Set the project’s CMS URL (on the project page)
            and its audit token here. The token is sent as
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              Authorization: Bearer &lt;token&gt;
            </code>
            to the audit endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AuditSyncButton />

          {projectRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects yet. Create one to configure its audit token.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {projectRows.map((project) => (
                <div
                  key={project.id}
                  data-project-id={project.id}
                  className="flex flex-col gap-1 border-b pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{project.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {project.cmsUrl ?? "No CMS URL set"}
                    </span>
                  </div>
                  <CmsTokenForm
                    projectId={project.id}
                    cmsType={project.cmsType}
                    hasToken={configuredKeys.has(cmsTokenKey(project.id))}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Alert rules</CardTitle>
          <CardDescription>
            Alert rules fire when a metrics, page-score, deploy or audit event
            breaches a threshold. Webhook deliveries post a JSON text payload to
            a Slack- or Google Chat-compatible incoming webhook (the rule&apos;s
            destination, or SLACK_WEBHOOK_URL).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AlertRuleForm
            projects={projectRows.map((row) => ({
              id: row.id,
              name: row.name,
            }))}
          />
          <AlertRuleList rules={ruleRows} />
        </CardContent>
      </Card>
    </div>
  );
}
