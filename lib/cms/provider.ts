import type { Project } from "@/lib/db/schema";
import type { cmsType } from "@/lib/db/schema";

export type CmsType = (typeof cmsType.enumValues)[number];

/** A single audit/activity event, normalised across content backends. */
export type AuditEvent = {
  externalId: string;
  eventType: string;
  actor: string | null;
  ipAddress: string | null;
  summary: string;
  occurredAt: Date;
};

/**
 * What OpsHub needs from a content backend. Deliberately small — add methods
 * only when a milestone needs them. Providers live in lib/cms/*.
 */
export interface CmsProvider {
  readonly type: CmsType;
  listAuditEvents(project: Project, since: Date | null): Promise<AuditEvent[]>;
}
