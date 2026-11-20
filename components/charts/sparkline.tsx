import { cn } from "@/lib/utils";

type SparklineProps = {
  /** Chronological values, oldest first. Non-finite values are ignored. */
  values: number[];
  className?: string;
  ariaLabel?: string;
};

const WIDTH = 100;
const HEIGHT = 28;
const PAD = 3;

/**
 * Dependency-free inline SVG sparkline (M5). Scaling uses a fixed viewBox with
 * `preserveAspectRatio="none"` and `non-scaling-stroke`, so it fills whatever
 * box the parent gives it without pulling in a charting library.
 */
export function Sparkline({ values, className, ariaLabel }: SparklineProps) {
  const points = values.filter((value) => Number.isFinite(value));

  if (points.length === 0) {
    return (
      <div
        className={cn("h-7 w-full rounded bg-muted/40", className)}
        aria-hidden
      />
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (WIDTH - PAD * 2) / (points.length - 1) : 0;

  const coords = points.map((value, index) => ({
    x: PAD + index * stepX,
    y: HEIGHT - PAD - ((value - min) / range) * (HEIGHT - PAD * 2),
  }));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full text-primary", className)}
      {...(ariaLabel
        ? { role: "img", "aria-label": ariaLabel }
        : { "aria-hidden": true })}
    >
      {coords.length > 1 ? (
        <polyline
          points={coords
            .map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`)
            .join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : (
        <circle
          cx={coords[0]!.x}
          cy={coords[0]!.y}
          r={1.5}
          fill="currentColor"
        />
      )}
    </svg>
  );
}
