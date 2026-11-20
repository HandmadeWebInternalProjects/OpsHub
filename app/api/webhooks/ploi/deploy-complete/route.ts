import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { evaluateDeployFailed } from "@/lib/alerts";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import type { Project } from "@/lib/db/schema";
import {
  insertDeployEvent,
  recordDeployment,
  setProjectStatus,
} from "@/lib/deploy";
import { env } from "@/lib/env";
import { logger, redact } from "@/lib/logger";
import { getPloiClient } from "@/lib/ploi";

export const dynamic = "force-dynamic";

/**
 * Ploi's deploy notification payload (site Notifications tab → custom URL).
 * It is a plain JSON POST with no signature, so every field is treated as
 * untrusted input (PROJECT.md §9: Zod at every external boundary).
 */
const ploiNotificationSchema = z.looseObject({
  server_id: z.coerce.number().int().positive().optional(),
  site_id: z.coerce.number().int().positive(),
  latest_deploy_log: z.string().nullish(),
  root_domain: z.string().nullish(),
});

/** Constant-time string comparison that tolerates unequal lengths. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function findProject(
  siteId: number,
  domain: string | null | undefined,
): Promise<Project | null> {
  const [bySite] = await db
    .select()
    .from(projects)
    .where(eq(projects.ploiSiteId, siteId))
    .limit(1);
  if (bySite) return bySite;

  if (domain) {
    const [byDomain] = await db
      .select()
      .from(projects)
      .where(eq(projects.domain, domain))
      .limit(1);
    if (byDomain) return byDomain;
  }

  return null;
}

/**
 * `POST /api/webhooks/ploi/deploy-complete` (PROJECT.md §6, M4).
 *
 * Ploi sends no HMAC signature, so the endpoint is authenticated with a shared
 * secret embedded in the callback URL (`?token=…`, `PLOI_WEBHOOK_SECRET`). The
 * callback is only a trigger: the authoritative deployment state is re-read
 * from `GET .../deployments` and recorded idempotently (deduped on the Ploi
 * deployment id), so retries or duplicate notifications cannot double-count.
 *
 * The URL may carry `&event=started` to mark the "deployment started" channel;
 * the default (`completed`) handles the "deployment finished" channel.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = env.PLOI_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "The Ploi webhook secret is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!safeEqual(token, secret)) {
    // Never log the presented token.
    logger.warn("Ploi deploy webhook rejected: bad token");
    return NextResponse.json(
      { ok: false, error: "Invalid webhook token." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed JSON payload." },
      { status: 400 },
    );
  }

  const parsed = ploiNotificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Unexpected notification payload." },
      { status: 400 },
    );
  }

  const { site_id: siteId, server_id: payloadServerId } = parsed.data;
  const { latest_deploy_log: log, root_domain: domain } = parsed.data;
  const isStarted = url.searchParams.get("event") === "started";

  const project = await findProject(siteId, domain);
  if (!project) {
    // Unknown site: acknowledge so Ploi does not consider the callback failed.
    logger.info({ siteId }, "Ploi deploy webhook: no matching project");
    return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
  }

  try {
    if (isStarted) {
      await setProjectStatus(project.id, "deploying");
      await insertDeployEvent({
        projectId: project.id,
        externalId: null,
        event: "deploy_started",
        status: "deploying",
        message: log ?? "Deployment started.",
      });
    } else {
      const serverId = project.ploiServerId ?? payloadServerId;
      const [latest] =
        serverId != null
          ? await getPloiClient().listDeployments(serverId, siteId, {
              perPage: 1,
            })
          : [];

      if (latest) {
        const mapped = await recordDeployment(project.id, latest);
        if (mapped.event === "deploy_failed") {
          try {
            await evaluateDeployFailed({
              projectId: project.id,
              projectName: project.name,
              deploymentId: latest.id,
              message: latest.commit_message ?? null,
            });
          } catch (error) {
            logger.warn(
              { projectId: project.id, error: redact(error) },
              "deploy_failed alert evaluation failed",
            );
          }
        }
      } else {
        // Ploi has not listed the deployment yet (the API omits runs that are
        // still finishing). Record the notification; the log text is stable for
        // a given deployment, so it doubles as the idempotency key.
        await setProjectStatus(project.id, "live");
        await insertDeployEvent({
          projectId: project.id,
          externalId: `notification:${siteId}:${log ?? "completed"}`,
          event: "deploy_completed",
          status: "completed",
          message: log ?? null,
        });
      }
    }

    try {
      revalidatePath(`/projects/${project.id}`);
    } catch {
      // revalidatePath requires a Next.js request scope; ignore when absent.
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error(
      { error: redact(error), projectId: project.id },
      "Ploi deploy webhook failed to record the deployment",
    );
    return NextResponse.json(
      { ok: false, error: "Could not record the deployment." },
      { status: 500 },
    );
  }
}
