import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { PloiLinkForm } from "@/components/projects/ploi-link-form";
import { ArchiveProjectButton } from "@/components/projects/archive-project-button";
import { AuditActivity } from "@/components/projects/audit-activity";
import { DeployTimeline } from "@/components/projects/deploy-timeline";
import { RedeployButton } from "@/components/projects/redeploy-button";
import { ProjectForm } from "@/components/projects/project-form";
import { StatusBadge } from "@/components/status-badge";
import {
  ScoreTrendChart,
  type ScorePoint,
} from "@/components/charts/score-trend-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import {
  clients,
  deployEvents,
  auditSummaries,
  pageScores,
  projects,
  servers,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type ExternalLinkProps = {
  label: string;
  href: string | null;
};

function ExternalLink({ label, href }: ExternalLinkProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm text-primary hover:underline"
        >
          {href}
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const [row] = await db
    .select({ project: projects, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) {
    notFound();
  }

  const { project, clientName } = row;

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(asc(clients.name));

  const ploiServers = await db
    .select({
      ploiServerId: servers.ploiServerId,
      name: servers.name,
      ipAddress: servers.ipAddress,
    })
    .from(servers)
    .orderBy(asc(servers.name));

  const deployTimeline = await db
    .select()
    .from(deployEvents)
    .where(eq(deployEvents.projectId, id))
    .orderBy(desc(deployEvents.occurredAt))
    .limit(20);

  const scoreSince = new Date(Date.now() - THIRTY_DAYS_MS);
  const scoreRows = await db
    .select()
    .from(pageScores)
    .where(
      and(eq(pageScores.projectId, id), gte(pageScores.capturedAt, scoreSince)),
    )
    .orderBy(asc(pageScores.capturedAt));

  const scorePoints: ScorePoint[] = scoreRows.map((row) => ({
    capturedAt: row.capturedAt.toISOString(),
    performance: row.performance,
    accessibility: row.accessibility,
    bestPractices: row.bestPractices,
    seo: row.seo,
  }));
  const latestScore = scoreRows.at(-1);

  const auditEvents = await db
    .select()
    .from(auditSummaries)
    .where(eq(auditSummaries.projectId, id))
    .orderBy(desc(auditSummaries.capturedAt))
    .limit(20);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Projects
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="flex items-start gap-2">
            <RedeployButton
              projectId={project.id}
              disabled={
                project.status === "archived" || project.ploiSiteId == null
              }
            />
            <ArchiveProjectButton
              projectId={project.id}
              disabled={project.status === "archived"}
            />
          </div>
        </div>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          <div className="flex items-center justify-between gap-4 border-b py-2">
            <span className="text-sm text-muted-foreground">Client</span>
            <Link
              href={`/clients/${project.clientId}`}
              className="text-sm font-medium hover:underline"
            >
              {clientName ?? "Unknown"}
            </Link>
          </div>
          <div className="flex items-center justify-between gap-4 border-b py-2">
            <span className="text-sm text-muted-foreground">Domain</span>
            <span className="text-sm font-medium">{project.domain}</span>
          </div>
          <ExternalLink label="CMS admin" href={project.cmsUrl} />
          <ExternalLink label="Astro repo" href={project.astroRepoUrl} />
          <ExternalLink label="CMS repo" href={project.cmsRepoUrl} />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Edit project</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm
            clients={allClients}
            projectId={project.id}
            defaultValues={{
              clientId: project.clientId,
              name: project.name,
              slug: project.slug,
              domain: project.domain,
              cmsType: project.cmsType,
              cmsUrl: project.cmsUrl ?? "",
              astroRepoUrl: project.astroRepoUrl ?? "",
              cmsRepoUrl: project.cmsRepoUrl ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Ploi infrastructure</CardTitle>
        </CardHeader>
        <CardContent>
          <PloiLinkForm
            projectId={project.id}
            servers={ploiServers}
            defaultServerId={project.ploiServerId}
            defaultSiteId={project.ploiSiteId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Page scores</CardTitle>
          <CardDescription>
            Lighthouse CI performance, accessibility, best practices and SEO
            over the last 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scorePoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No page scores yet. Point a Lighthouse CI pipeline at{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                POST /api/webhooks/lighthouse/&lt;projectId&gt;
              </code>{" "}
              to populate this chart (see the README).
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <ScoreTrendChart data={scorePoints} />
              {latestScore ? (
                <p className="text-xs text-muted-foreground">
                  Latest capture{" "}
                  {latestScore.capturedAt
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}{" "}
                  UTC · performance {latestScore.performance} · accessibility{" "}
                  {latestScore.accessibility} · best practices{" "}
                  {latestScore.bestPractices} · SEO {latestScore.seo}
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <AuditActivity events={auditEvents} />

      <DeployTimeline events={deployTimeline} />
    </div>
  );
}
