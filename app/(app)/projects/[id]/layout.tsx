import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { ArchiveProjectButton } from "@/components/projects/archive-project-button";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { RedeployButton } from "@/components/projects/redeploy-button";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Project header + tab navigation; tab pages render as children. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    notFound();
  }

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

      <ProjectTabs projectId={project.id} />
      {children}
    </div>
  );
}
