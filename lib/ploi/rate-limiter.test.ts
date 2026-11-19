import { describe, expect, it } from "vitest";

import { TokenBucketRateLimiter } from "./rate-limiter";

describe("TokenBucketRateLimiter", () => {
  it("allows a burst up to capacity, then refills over time", async () => {
    let t = 0;
    const limiter = new TokenBucketRateLimiter(
      2,
      1,
      () => t,
      async (ms) => {
        t += ms;
      },
    );

    expect(limiter.availableTokens).toBe(2);
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.availableTokens).toBe(0);

    // Third acquire must wait 1000ms for one token at 1 token/sec.
    await limiter.acquire();
    expect(t).toBe(1000);
  });

  it("enforces the production 5 req/sec cap", async () => {
    let t = 0;
    const limiter = new TokenBucketRateLimiter(
      5,
      5,
      () => t,
      async (ms) => {
        t += ms;
      },
    );

    for (let i = 0; i < 10; i += 1) {
      await limiter.acquire();
    }

    // First 5 are immediate (burst); the next 5 each wait 200ms.
    expect(t).toBe(1000);
  });
});
