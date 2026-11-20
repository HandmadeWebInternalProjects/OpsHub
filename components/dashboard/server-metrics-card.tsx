import { Sparkline } from "@/components/charts/sparkline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type MetricSeries = {
  cpu: number[];
  ram: number[];
  disk: number[];
  load: number[];
};

export type ServerMetricsCardProps = {
  name: string;
  ipAddress: string;
  capturedAt: Date | null;
  latest: {
    cpu: number | null;
    ram: number | null;
    disk: number | null;
    load: number | null;
  };
  series: MetricSeries;
};

function formatPct(value: number | null): string {
  return value == null ? "\u2014" : `${value.toFixed(1)}%`;
}

function formatLoad(value: number | null): string {
  return value == null ? "\u2014" : value.toFixed(2);
}

function formatCapturedAt(value: Date | null): string {
  if (!value) return "No samples yet";
  return `Updated ${value.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const METRICS = [
  { key: "cpu", label: "CPU", format: formatPct },
  { key: "ram", label: "RAM", format: formatPct },
  { key: "disk", label: "Disk", format: formatPct },
  { key: "load", label: "Load", format: formatLoad },
] as const;

/** One server's vitals with a 7-day sparkline per metric (PROJECT.md §6, M5). */
export function ServerMetricsCard({
  name,
  ipAddress,
  capturedAt,
  latest,
  series,
}: ServerMetricsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{name}</CardTitle>
          <span className="font-mono text-xs text-muted-foreground">
            {ipAddress || "\u2014"}
          </span>
        </div>
        <CardDescription>{formatCapturedAt(capturedAt)}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {METRICS.map((metric) => (
            <div key={metric.key} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {metric.label}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {metric.format(latest[metric.key])}
              </span>
              <Sparkline
                values={series[metric.key]}
                ariaLabel={`${name} ${metric.label} over the last 7 days`}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
