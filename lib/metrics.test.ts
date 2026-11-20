import { describe, expect, it } from "vitest";

import {
  latestStatistic,
  metricsRetentionCutoff,
  numericValue,
  parseStatistic,
} from "./metrics";

describe("parseStatistic", () => {
  it("maps Ploi's string percentages onto the snapshot columns", () => {
    const metric = parseStatistic({
      cpu: "12.4",
      ram: "36.32",
      disk: "86",
      load_average: "0.55",
      date: "2026-11-20 09:05:00",
    });

    expect(metric.cpuPct).toBe("12.40");
    expect(metric.ramPct).toBe("36.32");
    expect(metric.diskUsedPct).toBe("86.00");
    expect(metric.loadAvg1m).toBe("0.55");
    expect(metric.capturedAt.toISOString()).toBe("2026-11-20T09:05:00.000Z");
  });

  it("stores null for missing or non-numeric values", () => {
    const metric = parseStatistic({
      cpu: null,
      ram: "",
      disk: "not-a-number",
      load_average: undefined,
      date: null,
    });

    expect(metric.cpuPct).toBeNull();
    expect(metric.ramPct).toBeNull();
    expect(metric.diskUsedPct).toBeNull();
    expect(metric.loadAvg1m).toBeNull();
    // Falls back to "now" when there is no usable date.
    expect(metric.capturedAt.getTime()).not.toBeNaN();
  });
});

describe("latestStatistic", () => {
  it("returns the last datapoint", () => {
    expect(
      latestStatistic([
        { cpu: "1", date: "a" },
        { cpu: "2", date: "b" },
      ])?.cpu,
    ).toBe("2");
  });

  it("returns null for an empty series", () => {
    expect(latestStatistic([])).toBeNull();
  });
});

describe("numericValue", () => {
  it("parses numeric strings and rejects null / invalid", () => {
    expect(numericValue("42.50")).toBe(42.5);
    expect(numericValue(null)).toBeNull();
    expect(numericValue("nope")).toBeNull();
  });
});

describe("metricsRetentionCutoff", () => {
  it("is 90 days before the reference time", () => {
    const now = new Date("2026-11-20T00:00:00.000Z");
    expect(metricsRetentionCutoff(now).toISOString()).toBe(
      "2026-08-22T00:00:00.000Z",
    );
  });
});
