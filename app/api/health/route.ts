import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { logger, redact } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** GET /api/health — reports whether the database is reachable. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: "up" });
  } catch (error) {
    logger.error(
      { error: redact(error) },
      "health check: database unreachable",
    );
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
