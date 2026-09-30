// Client-side rate limiting for the System One API: requests per minute and
// input tokens per second. Budgets are granted in FIFO order so a large
// request is not starved by small ones. Concurrency is the caller's job
// (scanUnits runs a fixed number of workers).

export type LimiterOptions = {
  /** Published early-access limit: 1,200. */
  requestsPerMinute?: number;
  /** Published early-access limit: 250,000. */
  tokensPerSecond?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type Limiter = {
  /** Resolves once one request of `estimatedTokens` input tokens may be sent. */
  acquire(estimatedTokens: number): Promise<void>;
  /** Holds back every caller for `ms`, e.g. after the server answers 429. */
  pauseFor(ms: number): void;
};

export function createLimiter(options: LimiterOptions = {}): Limiter {
  const requestsPerMinute = positive("requestsPerMinute", options.requestsPerMinute ?? 1_200);
  const tokensPerSecond = positive("tokensPerSecond", options.tokensPerSecond ?? 250_000);
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  // Each bucket holds at most one second of its rate, so bursts stay small.
  const requests = createBucket(requestsPerMinute / 60_000, Math.max(1, requestsPerMinute / 60));
  const tokens = createBucket(tokensPerSecond / 1_000, tokensPerSecond);

  let pausedUntil = -Infinity;
  let queue: Promise<void> = Promise.resolve();

  async function waitForBudget(estimatedTokens: number): Promise<void> {
    // A request larger than the bucket would wait forever; let it drain the bucket instead.
    const cost = Math.min(estimatedTokens, tokens.capacity);
    for (;;) {
      const t = now();
      const wait = Math.max(pausedUntil - t, requests.waitFor(1, t), tokens.waitFor(cost, t));
      if (wait <= 0) {
        requests.take(1);
        tokens.take(cost);
        return;
      }
      // Whole milliseconds: a leftover like 1e-14 ms can vanish in the clock
      // value and never be waited out.
      await sleep(Math.ceil(wait));
    }
  }

  return {
    acquire(estimatedTokens) {
      if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
        return Promise.reject(new RangeError(`estimatedTokens must be a finite number >= 0, got ${estimatedTokens}`));
      }
      const turn = queue.then(() => waitForBudget(estimatedTokens));
      queue = turn.catch(() => {});
      return turn;
    },
    pauseFor(ms) {
      if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`pause must be a finite number >= 0, got ${ms}`);
      pausedUntil = Math.max(pausedUntil, now() + ms);
    },
  };
}

function positive(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite number > 0, got ${value}`);
  return value;
}

function createBucket(ratePerMs: number, capacity: number) {
  let level = capacity;
  let last: number | undefined;

  function refill(t: number): void {
    if (last !== undefined) level = Math.min(capacity, level + (t - last) * ratePerMs);
    last = t;
  }

  return {
    capacity,
    /** Milliseconds until `amount` is available; 0 if it is available now. */
    waitFor(amount: number, t: number): number {
      refill(t);
      return level >= amount ? 0 : (amount - level) / ratePerMs;
    },
    take(amount: number): void {
      level -= amount;
    },
  };
}
