import { describe, expect, it } from "vitest";

import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  it("opens after 3 consecutive failures and blocks requests", () => {
    const breaker = new CircuitBreaker(3, 1000, () => 0);

    expect(breaker.state).toBe("closed");
    expect(breaker.allowRequest()).toBe(true);

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe("closed");

    breaker.recordFailure();
    expect(breaker.state).toBe("open");
    expect(breaker.allowRequest()).toBe(false);
    expect(breaker.retryAfterMs()).toBe(1000);
  });

  it("half-opens after the cooldown and closes on a successful probe", () => {
    let t = 0;
    const breaker = new CircuitBreaker(3, 1000, () => t);
    for (let i = 0; i < 3; i += 1) breaker.recordFailure();

    t = 1000;
    expect(breaker.state).toBe("half-open");
    expect(breaker.allowRequest()).toBe(true);
    // Only one probe is allowed while half-open.
    expect(breaker.allowRequest()).toBe(false);

    breaker.recordSuccess();
    expect(breaker.state).toBe("closed");
    expect(breaker.allowRequest()).toBe(true);
  });

  it("re-opens when a half-open probe fails", () => {
    let t = 0;
    const breaker = new CircuitBreaker(3, 1000, () => t);
    for (let i = 0; i < 3; i += 1) breaker.recordFailure();

    t = 1000;
    expect(breaker.allowRequest()).toBe(true);
    breaker.recordFailure();

    expect(breaker.state).toBe("open");
    t = 1500;
    expect(breaker.state).toBe("open");
    t = 2000;
    expect(breaker.state).toBe("half-open");
  });
});
