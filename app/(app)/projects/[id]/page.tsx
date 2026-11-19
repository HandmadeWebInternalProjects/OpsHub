import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { ArchiveProjectButton } from "@/components/projects/archive-project-button";
import { ProjectForm } from "@/components/projects/project-form";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { clients, projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

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
          <ArchiveProjectButton
            projectId={project.id}
            disabled={project.status === "archived"}
          />
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
          <ExternalLink label="Strapi admin" href={project.strapiUrl} />
          <ExternalLink label="Astro repo" href={project.astroRepoUrl} />
          <ExternalLink label="Strapi repo" href={project.strapiRepoUrl} />
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
              strapiUrl: project.strapiUrl ?? "",
              astroRepoUrl: project.astroRepoUrl ?? "",
              strapiRepoUrl: project.strapiRepoUrl ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
