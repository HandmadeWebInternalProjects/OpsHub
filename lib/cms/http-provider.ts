import { z } from "zod";

import type { Project } from "@/lib/db/schema";

import type { AuditEvent, CmsProvider, CmsType } from "./provider";

/**
 * OpsHub's content-backend audit contract (PROJECT.md §5.3, M7).
 *
 * The client CMS exposes a read-only endpoint that returns recent audit events
 * in one normalised shape; OpsHub pulls it with the project's token. This keeps
 * OpsHub provider-agnostic — the CMS side adapts its native audit source to the
 * contract (see README for a Payload and a Strapi reference adapter).
 *
 *   GET {cms_url}/api/opshub/audit?since=<ISO8601>&limit=50
 *   Authorization: Bearer <cms_token_{projectId}>
 *   200 { "events": [ { id, type, actor, ip, summary, occurredAt } ] }
 */
export const AUDIT_PATH = "/api/opshub/audit";
const DEFAULT_LIMIT = 50;
const TIMEOUT_MS = 15_000;

const auditEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  actor: z.string().nullish(),
  ip: z.string().nullish(),
  summary: z.string().min(1),
  occurredAt: z.coerce.date(),
});

const auditResponseSchema = z.object({
  events: z.array(auditEventSchema),
});

export type HttpAuditProviderConfig = {
  type: CmsType;
  cmsUrl: string;
  token: string;
};

/** Shared client for the OpsHub audit contract, used by Payload/Strapi. */
export class HttpAuditProvider implements CmsProvider {
  constructor(private readonly config: HttpAuditProviderConfig) {}

  get type(): CmsType {
    return this.config.type;
  }

  async listAuditEvents(
    _project: Project,
    since: Date | null,
  ): Promise<AuditEvent[]> {
    const url = new URL(this.config.cmsUrl.replace(/\/+$/, "") + AUDIT_PATH);
    url.searchParams.set("limit", String(DEFAULT_LIMIT));
    if (since) url.searchParams.set("since", since.toISOString());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          authorization: `Bearer ${this.config.token}`,
          accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `Audit endpoint returned ${response.status} for ${this.config.type}.`,
      );
    }

    const parsed = auditResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(
        `Unexpected audit response shape from ${this.config.type}.`,
      );
    }

    return parsed.data.events.map((event) => ({
      externalId: event.id,
      eventType: event.type,
      actor: event.actor ?? null,
      ipAddress: event.ip ?? null,
      summary: event.summary,
      occurredAt: event.occurredAt,
    }));
  }
}
