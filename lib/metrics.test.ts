import { describe, expect, it } from "vitest";

import { metricsRetentionCutoff, numericValue, parseMetrics } from "./metrics";

describe("parseMetrics", () => {
  const now = new Date("2026-11-20T12:00:00.000Z");

  it("reads the live named-series shape, taking the newest datapoint", () => {
    const metric = parseMetrics(
      [
        { name: "Disk", data: { "10:25": 54, "11:20": 55 } },
        { name: "CPU", data: { "10:25": 4.1, "11:20": 0.7 } },
        { name: "RAM", data: { "10:25": 16.36, "11:20": 16.14 } },
      ],
      now,
    );

    expect(metric?.cpuPct).toBe("0.70");
    expect(metric?.ramPct).toBe("16.14");
    expect(metric?.diskUsedPct).toBe("55.00");
    // The live endpoint has no Load series.
    expect(metric?.loadAvg1m).toBeNull();
    // Series carry no absolute date, so capturedAt is the run time.
    expect(metric?.capturedAt).toBe(now);
  });

  it("still reads the documented flat shape", () => {
    const metric = parseMetrics([
      {
        cpu: "12.4",
        ram: "36.32",
        disk: "86",
        load_average: "0.55",
        date: "2026-11-20 09:05:00",
      },
    ]);

    expect(metric?.cpuPct).toBe("12.40");
    expect(metric?.ramPct).toBe("36.32");
    expect(metric?.diskUsedPct).toBe("86.00");
    expect(metric?.loadAvg1m).toBe("0.55");
    expect(metric?.capturedAt.toISOString()).toBe("2026-11-20T09:05:00.000Z");
  });

  it("returns null when there is no usable data", () => {
    expect(parseMetrics([])).toBeNull();
    expect(parseMetrics([{ name: "Something", data: {} }])).toBeNull();
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
