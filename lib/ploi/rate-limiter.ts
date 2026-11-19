/**
 * Token-bucket rate limiter.
 *
 * PROJECT.md §5.1 mandates a 5 req/sec cap. A token bucket allows a short
 * burst up to `capacity` and then refills smoothly at `refillPerSecond`.
 * Acquires are serialized so concurrent callers cannot race the bucket.
 */
export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: SleepFn = defaultSleep,
  ) {
    if (capacity <= 0) throw new Error("capacity must be > 0");
    if (refillPerSecond <= 0) throw new Error("refillPerSecond must be > 0");
    this.tokens = capacity;
    this.lastRefill = now();
  }

  /** Wait until a token is available, then consume it. Serialized. */
  acquire(): Promise<void> {
    const run = this.queue.then(() => this.take());
    // Never let one rejection poison the chain for later callers.
    this.queue = run.catch(() => undefined);
    return run;
  }

  get availableTokens(): number {
    this.refill(this.now());
    return this.tokens;
  }

  private refill(ts: number): void {
    const elapsed = (ts - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillPerSecond,
    );
    this.lastRefill = ts;
  }

  private async take(): Promise<void> {
    for (;;) {
      this.refill(this.now());
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      const waitMs = Math.ceil((deficit / this.refillPerSecond) * 1000);
      await this.sleep(Math.max(waitMs, 1));
    }
  }
}
