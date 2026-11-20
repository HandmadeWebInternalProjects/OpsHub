import { describe, expect, it } from "vitest";

import { shouldFire } from "./evaluate";

describe("shouldFire", () => {
  it("server_disk_pct fires only above the threshold", () => {
    expect(shouldFire("server_disk_pct", 85, 80)).toBe(true);
    expect(shouldFire("server_disk_pct", 80, 80)).toBe(false);
  });

  it("page_score_performance fires only below the threshold", () => {
    expect(shouldFire("page_score_performance", 70, 90)).toBe(true);
    expect(shouldFire("page_score_performance", 90, 90)).toBe(false);
  });

  it("audit_login_failed_count fires only above the threshold", () => {
    expect(shouldFire("audit_login_failed_count", 3, 2)).toBe(true);
    expect(shouldFire("audit_login_failed_count", 2, 2)).toBe(false);
  });

  it("deploy_failed always fires and ignores the threshold", () => {
    expect(shouldFire("deploy_failed", 0, null)).toBe(true);
  });

  it("a missing threshold never fires a numeric rule", () => {
    expect(shouldFire("server_disk_pct", 99, null)).toBe(false);
  });
});
