import { parsePloiDate } from "@/lib/deploy";
import type { PloiServerStatistic } from "@/lib/ploi";

/** M5: the metrics job runs on this cadence, so snapshots are 5-minute resolution. */
export const METRICS_INTERVAL_MS = 5 * 60_000;

/** M5: snapshots older than this are pruned by the metrics job. */
export const METRICS_RETENTION_DAYS = 90;

/** A single Ploi statistic normalised to the `metrics_snapshots` columns. */
export type ParsedMetric = {
  capturedAt: Date;
  cpuPct: string | null;
  ramPct: string | null;
  diskUsedPct: string | null;
  loadAvg1m: string | null;
};

/** Ploi sends statistic values as strings (e.g. "36.32"); numeric columns take strings. */
function toNumeric(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
}

/** The most recent datapoint in a monitored server's `statistics` array. */
export function latestStatistic(
  statistics: PloiServerStatistic[],
): PloiServerStatistic | null {
  return statistics.at(-1) ?? null;
}

/**
 * Map one Ploi `statistics` entry onto the `metrics_snapshots` columns. Ploi's
 * `ram` is a percentage (not MB), so it lands in `ram_pct`; see the schema note.
 */
export function parseStatistic(statistic: PloiServerStatistic): ParsedMetric {
  return {
    capturedAt: parsePloiDate(statistic.date) ?? new Date(),
    cpuPct: toNumeric(statistic.cpu),
    ramPct: toNumeric(statistic.ram),
    diskUsedPct: toNumeric(statistic.disk),
    loadAvg1m: toNumeric(statistic.load_average),
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
