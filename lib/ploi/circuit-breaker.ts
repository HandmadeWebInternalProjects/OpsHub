/**
 * Circuit breaker for the Ploi integration.
 *
 * PROJECT.md §5.1: after 3 consecutive failures, pause the sync and alert.
 * States: `closed` (healthy) → `open` (paused for a cooldown) → `half-open`
 * (a single probe is allowed) → back to `closed` on success or `open` again on
 * failure.
 */
export type BreakerState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probeInFlight = false;

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {
    if (threshold <= 0) throw new Error("threshold must be > 0");
  }

  get state(): BreakerState {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt >= this.cooldownMs ? "half-open" : "open";
  }

  get failureCount(): number {
    return this.failures;
  }

  /** Milliseconds until the next probe is allowed (0 when closed). */
  retryAfterMs(): number {
    if (this.openedAt === null) return 0;
    const remaining = this.cooldownMs - (this.now() - this.openedAt);
    return remaining > 0 ? remaining : 0;
  }

  /** Whether a request may proceed now. Claims the half-open probe slot. */
  allowRequest(): boolean {
    const state = this.state;
    if (state === "closed") return true;
    if (state === "half-open") {
      if (this.probeInFlight) return false;
      this.probeInFlight = true;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }

  recordFailure(): void {
    // A failed half-open probe re-opens immediately for another cooldown.
    if (this.state === "half-open") {
      this.failures = this.threshold;
      this.openedAt = this.now();
      this.probeInFlight = false;
      return;
    }
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openedAt = this.now();
    }
    this.probeInFlight = false;
  }
}
