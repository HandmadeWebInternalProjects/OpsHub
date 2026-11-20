import { describe, expect, it } from "vitest";

import { mapDeploymentStatus, parsePloiDate } from "./deploy";

describe("mapDeploymentStatus", () => {
  it("maps a successful deployment to live / deploy_completed", () => {
    expect(mapDeploymentStatus("success")).toEqual({
      event: "deploy_completed",
      projectStatus: "live",
      terminal: true,
    });
  });

  it("maps failed and cancelled to failed / deploy_failed", () => {
    for (const status of ["failed", "cancelled"]) {
      expect(mapDeploymentStatus(status)).toEqual({
        event: "deploy_failed",
        projectStatus: "failed",
        terminal: true,
      });
    }
  });

  it("maps a running status to deploying / deploy_started", () => {
    for (const status of ["deploying", "scheduled", "unknown"]) {
      expect(mapDeploymentStatus(status)).toEqual({
        event: "deploy_started",
        projectStatus: "deploying",
        terminal: false,
      });
    }
  });
});

describe("parsePloiDate", () => {
  it("treats Ploi's offset-less timestamps as UTC", () => {
    expect(parsePloiDate("2026-11-11 14:02:51")?.toISOString()).toBe(
      "2026-11-11T14:02:51.000Z",
    );
  });

  it("returns undefined for missing or invalid input", () => {
    expect(parsePloiDate(null)).toBeUndefined();
    expect(parsePloiDate("not-a-date")).toBeUndefined();
  });
});
