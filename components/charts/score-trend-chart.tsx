"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** One day's page scores (M6). */
export type ScorePoint = {
  /** ISO timestamp of the Lighthouse capture. */
  capturedAt: string;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
};

const SERIES = [
  { key: "performance", label: "Performance", stroke: "#22c55e" },
  { key: "accessibility", label: "Accessibility", stroke: "#3b82f6" },
  { key: "bestPractices", label: "Best practices", stroke: "#a855f7" },
  { key: "seo", label: "SEO", stroke: "#f59e0b" },
] as const;

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

/**
 * 30-day line chart of the four Lighthouse categories (PROJECT.md §6, M6).
 * A client component because recharts measures the DOM to size itself.
 */
export function ScoreTrendChart({ data }: { data: ScorePoint[] }) {
  return (
    <div
      className="h-72 w-full"
      role="img"
      aria-label="Page score trend over the last 30 days"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 0, left: -16 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="capturedAt"
            tickFormatter={(value: string) => formatDay(value)}
            fontSize={12}
            stroke="currentColor"
          />
          <YAxis
            domain={[0, 100]}
            fontSize={12}
            stroke="currentColor"
            tickCount={6}
          />
          <Tooltip
            labelFormatter={(value) => new Date(String(value)).toLocaleString()}
          />
          <Legend />
          {SERIES.map((series) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.stroke}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
