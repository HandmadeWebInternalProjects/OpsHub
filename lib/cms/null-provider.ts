import type { AuditEvent, CmsProvider, CmsType } from "./provider";

/** No-op provider for projects without a configured audit source. */
export class NullCmsProvider implements CmsProvider {
  constructor(public readonly type: CmsType) {}

  async listAuditEvents(): Promise<AuditEvent[]> {
    return [];
  }
}
