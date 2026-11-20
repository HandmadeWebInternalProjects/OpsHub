import { HttpAuditProvider } from "./http-provider";

/** Strapi content backend (PROJECT.md §5.3). Reads OpsHub's audit contract. */
export class StrapiProvider extends HttpAuditProvider {
  constructor(config: { cmsUrl: string; token: string }) {
    super({ type: "strapi", ...config });
  }
}
