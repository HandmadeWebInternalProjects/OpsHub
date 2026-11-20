import { HttpAuditProvider } from "./http-provider";

/** Payload content backend (PROJECT.md §5.3). Reads OpsHub's audit contract. */
export class PayloadProvider extends HttpAuditProvider {
  constructor(config: { cmsUrl: string; token: string }) {
    super({ type: "payload", ...config });
  }
}
