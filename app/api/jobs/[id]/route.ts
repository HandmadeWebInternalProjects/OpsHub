import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs, projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * `GET /api/jobs/{id}` — progress polling for the provisioning wizard
 * (PROJECT.md §6, M3). Returns the job's status plus, once the `provision_site`
 * handler has created it, the project it is provisioning.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "You must be signed in." },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json(
      { ok: false, error: "Invalid job id." },
      { status: 400 },
    );
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Job not found." },
      { status: 404 },
    );
  }

  // The project row is created by the job, so it may not exist yet; the id is
  // generated up front and carried on the payload.
  const payload = job.payload as { projectId?: unknown };
  const projectId =
    typeof payload.projectId === "string" ? payload.projectId : null;

  let project: {
    id: string;
    status: string;
    domain: string;
    ploiSiteId: number | null;
  } | null = null;

  if (projectId) {
    const [row] = await db
      .select({
        id: projects.id,
        status: projects.status,
        domain: projects.domain,
        ploiSiteId: projects.ploiSiteId,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    project = row ?? null;
  }

  return NextResponse.json({
    ok: true,
    data: {
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      },
      project,
    },
  });
}
