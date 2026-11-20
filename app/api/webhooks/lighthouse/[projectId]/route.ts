import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { evaluatePageScore } from "@/lib/alerts";
import { db } from "@/lib/db";
import { pageScores, projects } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logger, redact } from "@/lib/logger";

export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "x-ops-hub-signature";

const score = z.coerce.number().int().min(0).max(100);

/**
 * The Lighthouse CI report payload (PROJECT.md §5.2). Every field is untrusted
 * input (PROJECT.md §9: Zod at every external boundary).
 */
const lighthouseReportSchema = z.object({
  url: z.url(),
  captured_at: z.coerce.date().optional(),
  performance: score,
  accessibility: score,
  best_practices: score,
  seo: score,
  report_url: z.url().nullish(),
  // Optional CI build id; when absent the route derives one from the body hash
  // so a repeated identical POST is idempotent.
  external_id: z.string().min(1).nullish(),
});

/** `X-OpsHub-Signature: sha256=<hex>` over the raw request body. */
function expectedSignature(secret: string, rawBody: string): string {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}

/** Constant-time comparison that tolerates unequal lengths. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * `POST /api/webhooks/lighthouse/{projectId}` (PROJECT.md §5.2, M6).
 *
 * Authenticated with an HMAC-SHA256 signature over the raw body
 * (`X-OpsHub-Signature: sha256=<hex>`, `LIGHTHOUSE_WEBHOOK_SECRET`). A missing or
 * invalid signature is rejected with `401`. Writes are deduplicated on
 * `page_scores.external_id` (the reporter's CI build id, or a hash of the body),
 * so the same report can be POSTed more than once without double-counting.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const secret = env.LIGHTHOUSE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "The Lighthouse webhook secret is not configured." },
      { status: 503 },
    );
  }

  // The signature covers the raw bytes, so read the body before parsing.
  const rawBody = await request.text();
  const presented = request.headers.get(SIGNATURE_HEADER) ?? "";
  if (!safeEqual(presented, expectedSignature(secret, rawBody))) {
    // Never log the presented signature.
    logger.warn("Lighthouse webhook rejected: bad signature");
    return NextResponse.json(
      { ok: false, error: "Invalid webhook signature." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed JSON payload." },
      { status: 400 },
    );
  }

  const { projectId } = await context.params;
  if (!z.uuid().safeParse(projectId).success) {
    return NextResponse.json(
      { ok: false, error: "Unknown project." },
      { status: 404 },
    );
  }

  const parsed = lighthouseReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Unexpected report payload." },
      { status: 400 },
    );
  }

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Unknown project." },
      { status: 404 },
    );
  }

  const report = parsed.data;
  const externalId =
    report.external_id ??
    createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    await db
      .insert(pageScores)
      .values({
        projectId: project.id,
        externalId,
        capturedAt: report.captured_at ?? new Date(),
        url: report.url,
        performance: report.performance,
        accessibility: report.accessibility,
        bestPractices: report.best_practices,
        seo: report.seo,
        reportUrl: report.report_url ?? null,
      })
      .onConflictDoNothing({ target: pageScores.externalId });

    // M8: fire `page_score_performance` rules for the freshly recorded score.
    try {
      await evaluatePageScore({
        projectId: project.id,
        projectName: project.name,
        performance: report.performance,
      });
    } catch (error) {
      logger.warn(
        { error: redact(error), projectId: project.id },
        "page score alert evaluation failed",
      );
    }

    try {
      revalidatePath(`/projects/${project.id}`);
      revalidatePath("/dashboard");
    } catch {
      // revalidatePath requires a Next.js request scope; ignore when absent.
    }

    return NextResponse.json({ ok: true, externalId }, { status: 202 });
  } catch (error) {
    logger.error(
      { error: redact(error), projectId: project.id },
      "Lighthouse webhook failed to record the score",
    );
    return NextResponse.json(
      { ok: false, error: "Could not record the score." },
      { status: 500 },
    );
  }
}
