import { eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { integrationConfig } from "@/lib/db/schema";

/**
 * Per-project content-backend secrets (PROJECT.md §5.3/§6 M7). Stored in
 * `integration_config` keyed by `cms_token_{projectId}`, encrypted at rest.
 * Values are never returned to the UI or logged.
 */
export function cmsTokenKey(projectId: string): string {
  return `cms_token_${projectId}`;
}

/** Encrypt and upsert a project's CMS API token. */
export async function setCmsToken(
  projectId: string,
  token: string,
): Promise<void> {
  const encryptedValue = encryptSecret(token);
  await db
    .insert(integrationConfig)
    .values({ key: cmsTokenKey(projectId), encryptedValue })
    .onConflictDoUpdate({
      target: integrationConfig.key,
      set: { encryptedValue, updatedAt: new Date() },
    });
}

/** Remove a project's CMS token, if any. */
export async function clearCmsToken(projectId: string): Promise<void> {
  await db
    .delete(integrationConfig)
    .where(eq(integrationConfig.key, cmsTokenKey(projectId)));
}

/** Decrypt and return a project's CMS token, or null when unset. */
export async function getCmsToken(projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ encryptedValue: integrationConfig.encryptedValue })
    .from(integrationConfig)
    .where(eq(integrationConfig.key, cmsTokenKey(projectId)))
    .limit(1);

  if (!row) return null;
  return decryptSecret(row.encryptedValue);
}

/** All integration_config keys, for showing which projects have a token set. */
export async function listIntegrationConfigKeys(): Promise<Set<string>> {
  const rows = await db
    .select({ key: integrationConfig.key })
    .from(integrationConfig);
  return new Set(rows.map((row) => row.key));
}
