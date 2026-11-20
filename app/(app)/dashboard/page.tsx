import Link from "next/link";
import { asc, desc, eq, gte, max, ne } from "drizzle-orm";

import {
  ServerMetricsCard,
  type MetricSeries,
} from "@/components/dashboard/server-metrics-card";
import { StatusBadge } from "@/components/status-badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import {
  clients,
  deployEvents,
  metricsSnapshots,
  pageScores,
  projects,
  servers,
} from "@/lib/db/schema";
import { numericValue } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function formatWhen(value: Date | null): string {
  if (!value) return "\u2014";
  return value.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
    </Card>
  );
}

type ServerSeries = MetricSeries & { latestCapturedAt: Date | null };

function emptySeries(): ServerSeries {
  return { cpu: [], ram: [], disk: [], load: [], latestCapturedAt: null };
}

export default async function DashboardPage() {
  const since = new Date(Date.now() - SEVEN_DAYS_MS);

  const [serverRows, metricRows, projectRows, deployRows, scoreRows] =
    await Promise.all([
      db.select().from(servers).orderBy(asc(servers.name)),
      db
        .select({
          serverId: metricsSnapshots.serverId,
          capturedAt: metricsSnapshots.capturedAt,
          cpuPct: metricsSnapshots.cpuPct,
          ramPct: metricsSnapshots.ramPct,
          diskUsedPct: metricsSnapshots.diskUsedPct,
          loadAvg1m: metricsSnapshots.loadAvg1m,
        })
        .from(metricsSnapshots)
        .where(gte(metricsSnapshots.capturedAt, since))
        .orderBy(asc(metricsSnapshots.capturedAt)),
      db
        .select({
          id: projects.id,
          name: projects.name,
          domain: projects.domain,
          status: projects.status,
          clientName: clients.name,
        })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(ne(projects.status, "archived"))
        .orderBy(asc(projects.name)),
      db
        .select({
          projectId: deployEvents.projectId,
          lastDeployAt: max(deployEvents.occurredAt),
        })
        .from(deployEvents)
        .groupBy(deployEvents.projectId),
      db
        .select({
          projectId: pageScores.projectId,
          performance: pageScores.performance,
          capturedAt: pageScores.capturedAt,
        })
        .from(pageScores)
        .orderBy(desc(pageScores.capturedAt)),
    ]);

  // Group the 7-day metric rows per server (rows are already chronological).
  const seriesByServer = new Map<string, ServerSeries>();
  for (const row of metricRows) {
    const entry = seriesByServer.get(row.serverId) ?? emptySeries();
    const cpu = numericValue(row.cpuPct);
    const ram = numericValue(row.ramPct);
    const disk = numericValue(row.diskUsedPct);
    const load = numericValue(row.loadAvg1m);
    if (cpu != null) entry.cpu.push(cpu);
    if (ram != null) entry.ram.push(ram);
    if (disk != null) entry.disk.push(disk);
    if (load != null) entry.load.push(load);
    entry.latestCapturedAt = row.capturedAt;
    seriesByServer.set(row.serverId, entry);
  }

  const lastDeployByProject = new Map<string, Date>();
  for (const row of deployRows) {
    if (row.lastDeployAt)
      lastDeployByProject.set(row.projectId, row.lastDeployAt);
  }

  // Rows are newest-first, so the first entry per project is the latest score.
  const latestScoreByProject = new Map<string, number>();
  for (const row of scoreRows) {
    if (!latestScoreByProject.has(row.projectId)) {
      latestScoreByProject.set(row.projectId, row.performance);
    }
  }

  const liveProjects = projectRows.filter((p) => p.status === "live").length;
  const failingProjects = projectRows.filter(
    (p) => p.status === "failed",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Fleet overview — server vitals and project health.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Servers"
          value={serverRows.length}
          hint="cached from Ploi"
        />
        <SummaryCard
          label="Projects live"
          value={liveProjects}
          hint={`${projectRows.length} tracked`}
        />
        <SummaryCard
          label="Projects failing"
          value={failingProjects}
          hint="need attention"
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Servers</h2>
          <p className="text-sm text-muted-foreground">
            CPU, RAM, disk and load, with a 7-day trend per metric.
          </p>
        </div>
        {serverRows.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No servers yet</CardTitle>
              <CardDescription>
                Run a sync on the Servers page to pull your Ploi servers.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {serverRows.map((server) => {
              const series = seriesByServer.get(server.id) ?? emptySeries();
              return (
                <ServerMetricsCard
                  key={server.id}
                  name={server.name}
                  ipAddress={server.ipAddress}
                  capturedAt={series.latestCapturedAt}
                  latest={{
                    cpu: series.cpu.at(-1) ?? null,
                    ram: series.ram.at(-1) ?? null,
                    disk: series.disk.at(-1) ?? null,
                    load: series.load.at(-1) ?? null,
                  }}
                  series={{
                    cpu: series.cpu,
                    ram: series.ram,
                    disk: series.disk,
                    load: series.load,
                  }}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Project health</h2>
          <p className="text-sm text-muted-foreground">
            Status, last deploy and latest page score per project.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last deploy</TableHead>
                <TableHead>Page score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No projects yet. Create one to see its health here.
                  </TableCell>
                </TableRow>
              ) : (
                projectRows.map((project) => {
                  const score = latestScoreByProject.get(project.id);
                  return (
                    <TableRow key={project.id}>
                      <TableCell>
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium hover:underline"
                        >
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project.clientName ?? "\u2014"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={project.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatWhen(
                          lastDeployByProject.get(project.id) ?? null,
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {score == null ? "\u2014" : score}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
