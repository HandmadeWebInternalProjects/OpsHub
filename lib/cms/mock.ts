import type { AuditEvent, CmsProvider, CmsType } from "./provider";

/**
 * Mock content backend for local development and acceptance (USE_MOCKS=true),
 * mirroring the Ploi mock adapter. It emits a deterministic set of events with
 * stable externalIds, so a re-run dedupes instead of double-counting. The
 * ids are keyed by project so different projects get distinct rows.
 */
export class MockCmsProvider implements CmsProvider {
  constructor(
    public readonly type: CmsType,
    private readonly projectId: string,
  ) {}

  async listAuditEvents(): Promise<AuditEvent[]> {
    const occurredAt = new Date();
    return [
      {
        externalId: `mock-audit-${this.projectId}-login-failed`,
        eventType: "login_failed",
        actor: "intruder@example.com",
        ipAddress: "203.0.113.10",
        summary: "Failed admin login for intruder@example.com",
        occurredAt,
      },
      {
        externalId: `mock-audit-${this.projectId}-content-deleted`,
        eventType: "content_deleted",
        actor: "editor@example.com",
        ipAddress: "198.51.100.7",
        summary: "Deleted page “/pricing”",
        occurredAt,
      },
    ];
  }
}
