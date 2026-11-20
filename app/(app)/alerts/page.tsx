import { asc, desc, eq } from "drizzle-orm";

import { AcknowledgeButton } from "@/components/alerts/acknowledge-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { alertRuleLabel } from "@/lib/alerts/labels";
import { db } from "@/lib/db";
import { alerts, projects, servers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function formatUtc(value: Date | null): string {
  if (!value) return "\u2014";
  return `${value.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export default async function AlertsPage() {
  const rows = await db
    .select({
      id: alerts.id,
      title: alerts.title,
      detail: alerts.detail,
      ruleType: alerts.ruleType,
      status: alerts.status,
      triggeredAt: alerts.triggeredAt,
      deliveredAt: alerts.deliveredAt,
      deliveryError: alerts.deliveryError,
      acknowledgedAt: alerts.acknowledgedAt,
      acknowledgedBy: alerts.acknowledgedBy,
      projectName: projects.name,
      serverName: servers.name,
    })
    .from(alerts)
    .leftJoin(projects, eq(alerts.projectId, projects.id))
    .leftJoin(servers, eq(alerts.serverId, servers.id))
    .orderBy(asc(alerts.status), desc(alerts.triggeredAt))
    .limit(100);

  const openCount = rows.filter((row) => row.status === "open").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Fired alert rules. {openCount} open. Configure rules on the Settings
          page.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No alerts yet. When a rule breaches its threshold it appears here.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const open = row.status === "open";
            const scope = row.projectName ?? row.serverName ?? "Fleet-wide";
            return (
              <li key={row.id} data-alert-id={row.id}>
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="text-base">{row.title}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={open ? "destructive" : "outline"}>
                          {open ? "Open" : "Acknowledged"}
                        </Badge>
                        <span>{alertRuleLabel(row.ruleType)}</span>
                        <span>{"\u00b7"}</span>
                        <span>{scope}</span>
                        <span>{"\u00b7"}</span>
                        <span>{formatUtc(row.triggeredAt)}</span>
                      </div>
                    </div>
                    {open ? <AcknowledgeButton alertId={row.id} /> : null}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 text-sm">
                    <p>{row.detail}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.deliveryError
                        ? `Delivery failed: ${row.deliveryError}`
                        : row.deliveredAt
                          ? `Delivered ${formatUtc(row.deliveredAt)}`
                          : "Not delivered"}
                      {row.acknowledgedBy
                        ? ` \u00b7 Acknowledged by ${row.acknowledgedBy}`
                        : ""}
                    </p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
