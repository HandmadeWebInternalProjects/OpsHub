import { parsePloiDate } from "@/lib/deploy";
import type { PloiServerStatistic } from "@/lib/ploi";

/** M5: the metrics job runs on this cadence, so snapshots are 5-minute resolution. */
export const METRICS_INTERVAL_MS = 5 * 60_000;

/** M5: snapshots older than this are pruned by the metrics job. */
export const METRICS_RETENTION_DAYS = 90;

/** A single monitored server's stats, normalised to the `metrics_snapshots` columns. */
export type ServerMetrics = {
  capturedAt: Date;
  cpuPct: string | null;
  ramPct: string | null;
  diskUsedPct: string | null;
  loadAvg1m: string | null;
};

/** Ploi sends statistic values as numbers or strings; numeric columns take strings. */
function toNumeric(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const text = typeof value === "number" ? String(value) : value;
  if (text.trim() === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
}

/** The newest value in a `{ "<HH:MM>": value }` series (lexical HH:MM order). */
function latestDataValue(data: Record<string, number | string>): number | null {
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  keys.sort();
  const parsed = Number(data[keys[keys.length - 1]]);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The live `GET /servers/monitored` returns named time series
 * (`[{ name: "CPU", data: { "10:25": 4.1, … } }, …]`), NOT the flat
 * per-datapoint shape the docs show (verified against a real account
 * 2026-11-20).
 */
function isSeries(statistic: PloiServerStatistic): boolean {
  return (
    typeof statistic.name === "string" &&
    statistic.data != null &&
    typeof statistic.data === "object"
  );
}

function seriesValue(
  statistics: PloiServerStatistic[],
  match: (name: string) => boolean,
): number | null {
  for (const statistic of statistics) {
    if (!isSeries(statistic) || statistic.name == null) continue;
    if (match(statistic.name.toLowerCase())) {
      return latestDataValue(statistic.data ?? {});
    }
  }
  return null;
}

/**
 * Normalise one monitored server's `statistics` into a single snapshot row.
 *
 * Both the live named-series shape and the documented flat shape are accepted.
 * The live series carry no absolute date (only `HH:MM` keys), so `capturedAt` is
 * the job run time. The live endpoint exposes Disk/CPU/RAM but **no Load**, so
 * `loadAvg1m` is null for live servers.
 */
export function parseMetrics(
  statistics: PloiServerStatistic[],
  now: Date = new Date(),
): ServerMetrics | null {
  if (statistics.some(isSeries)) {
    const cpu = seriesValue(statistics, (name) => name.includes("cpu"));
    const ram = seriesValue(
      statistics,
      (name) => name.includes("ram") || name.includes("memory"),
    );
    const disk = seriesValue(
      statistics,
      (name) => name.includes("disk") || name.includes("storage"),
    );
    const load = seriesValue(statistics, (name) => name.includes("load"));

    if (cpu == null && ram == null && disk == null && load == null) {
      return null;
    }

    return {
      capturedAt: now,
      cpuPct: toNumeric(cpu),
      ramPct: toNumeric(ram),
      diskUsedPct: toNumeric(disk),
      loadAvg1m: toNumeric(load),
    };
  }

  const latest = statistics.at(-1);
  if (!latest) return null;

  return {
    capturedAt: parsePloiDate(latest.date) ?? now,
    cpuPct: toNumeric(latest.cpu),
    ramPct: toNumeric(latest.ram),
    diskUsedPct: toNumeric(latest.disk),
    loadAvg1m: toNumeric(latest.load_average),
  };
}

/** Parse a numeric column value (Drizzle returns `numeric` as a string). */
export function numericValue(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Cutoff before which snapshots should be pruned (M5 retention). */
export function metricsRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
