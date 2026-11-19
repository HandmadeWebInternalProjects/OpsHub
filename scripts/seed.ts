import { eq } from "drizzle-orm";

import { db, queryClient } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@opshub.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";

/**
 * Seeds the first admin user. Idempotent: re-running is a no-op once the
 * account exists. Override credentials with SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD.
 */
async function main(): Promise<void> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Admin user ${ADMIN_EMAIL} already exists — skipping.`);
    return;
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await db.insert(users).values({
    email: ADMIN_EMAIL,
    passwordHash,
    role: "admin",
  });

  console.log(`Seeded admin user: ${ADMIN_EMAIL}`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end({ timeout: 5 });
  });
