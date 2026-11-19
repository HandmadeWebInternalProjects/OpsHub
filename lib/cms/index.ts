import { NullCmsProvider } from "./null-provider";
import type { CmsProvider, CmsType } from "./provider";

/**
 * Resolve the CMS provider for a project.
 *
 * Payload/Strapi adapters land in M7 (§5.3). Until then every project falls
 * back to the no-op provider so the audit UI stays empty but functional.
 */
export function getCmsProvider(type: CmsType): CmsProvider {
  switch (type) {
    // case "payload":
    //   return new PayloadProvider();
    // case "strapi":
    //   return new StrapiProvider();
    default:
      return new NullCmsProvider(type);
  }
}

export type { AuditEvent, CmsProvider, CmsType } from "./provider";
