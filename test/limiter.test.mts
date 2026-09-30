import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLimiter, type LimiterOptions } from "../src/jev/limiter.mts";

// A fake clock: sleeping advances time instantly.
function fakeTime() {
  let clock = 0;
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
}

async function grantTimes(options: LimiterOptions, costs: number[]): Promise<number[]> {
  const time = fakeTime();
  const limiter = createLimiter({ ...options, ...time });
  return Promise.all(costs.map((cost) => limiter.acquire(cost).then(() => time.now())));
}

describe("createLimiter", () => {
  it("spaces requests to the per-minute rate", async () => {
    assert.deepEqual(await grantTimes({ requestsPerMinute: 60, tokensPerSecond: 1e9 }, [1, 1, 1]), [0, 1000, 2000]);
  });

  it("allows a one-second burst", async () => {
    assert.deepEqual(await grantTimes({ requestsPerMinute: 120, tokensPerSecond: 1e9 }, [1, 1, 1]), [0, 0, 500]);
  });

  it("spaces requests to the token rate", async () => {
    assert.deepEqual(await grantTimes({ requestsPerMinute: 1e6, tokensPerSecond: 100 }, [100, 100, 50]), [0, 1000, 1500]);
  });

  it("lets a request larger than one second of tokens through", async () => {
    assert.deepEqual(await grantTimes({ requestsPerMinute: 1e6, tokensPerSecond: 100 }, [500, 100]), [0, 1000]);
  });

  it("grants in FIFO order, so a large request is not overtaken", async () => {
    const time = fakeTime();
    const limiter = createLimiter({ requestsPerMinute: 1e6, tokensPerSecond: 100, ...time });
    const order: string[] = [];
    await Promise.all([
      limiter.acquire(60).then(() => order.push("small-1")),
      limiter.acquire(100).then(() => order.push("large")),
      limiter.acquire(10).then(() => order.push("small-2")),
    ]);
    assert.deepEqual(order, ["small-1", "large", "small-2"]);
  });

  it("finishes with fractional rates on a fake clock", async () => {
    const times = await grantTimes({ requestsPerMinute: 7, tokensPerSecond: 1e9 }, [1, 1, 1, 1]);
    assert.equal(times.length, 4);
    assert.ok(times.every((t) => Number.isInteger(t)));
  });

  it("holds everyone back after pauseFor", async () => {
    const time = fakeTime();
    const limiter = createLimiter(time);
    limiter.pauseFor(2500);
    await limiter.acquire(1);
    assert.equal(time.now(), 2500);
  });

  it("rejects bad estimates without blocking later callers", async () => {
    const limiter = createLimiter(fakeTime());
    await assert.rejects(limiter.acquire(Number.NaN), RangeError);
    await assert.rejects(limiter.acquire(-1), RangeError);
    await limiter.acquire(10);
  });

  it("rejects bad options", () => {
    assert.throws(() => createLimiter({ requestsPerMinute: 0 }), RangeError);
    assert.throws(() => createLimiter({ tokensPerSecond: Number.NaN }), RangeError);
    assert.throws(() => createLimiter().pauseFor(Number.NaN), RangeError);
  });

  it("queues 100k callers in linear time", async () => {
    const limiter = createLimiter({ requestsPerMinute: 1e12, tokensPerSecond: 1e12 });
    const started = performance.now();
    await Promise.all(Array.from({ length: 100_000 }, () => limiter.acquire(1)));
    assert.ok(performance.now() - started < 2000);
  });
});
