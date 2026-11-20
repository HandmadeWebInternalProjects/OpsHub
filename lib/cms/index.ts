import { env } from "@/lib/env";

import { MockCmsProvider } from "./mock";
import { NullCmsProvider } from "./null-provider";
import { PayloadProvider } from "./payload";
import { StrapiProvider } from "./strapi";
import type { CmsProvider, CmsType } from "./provider";

export type CmsProviderConfig = {
  type: CmsType;
  projectId: string;
  cmsUrl: string | null;
  /** Decrypted token, or null when the project has none. */
  token: string | null;
};

/**
 * Resolve the audit provider for a project (PROJECT.md §5.3, M7).
 *
 * With USE_MOCKS=true a mock provider stands in for every real backend so the
 * job and UI run locally with no client CMS. Otherwise Payload/Strapi read the
 * OpsHub audit contract when both a `cms_url` and a token are configured, and
 * anything missing falls back to the no-op provider.
 */
export function getCmsProvider(config: CmsProviderConfig): CmsProvider {
  if (env.USE_MOCKS && config.type !== "other") {
    return new MockCmsProvider(config.type, config.projectId);
  }

  const { cmsUrl, token } = config;
  if (!cmsUrl || !token) {
    return new NullCmsProvider(config.type);
  }

  switch (config.type) {
    case "payload":
      return new PayloadProvider({ cmsUrl, token });
    case "strapi":
      return new StrapiProvider({ cmsUrl, token });
    default:
      return new NullCmsProvider(config.type);
  }
}

export type { AuditEvent, CmsProvider, CmsType } from "./provider";
