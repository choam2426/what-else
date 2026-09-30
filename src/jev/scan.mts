// Runs one System One request per unit and reports what was and was not
// scanned. Failures are collected, not thrown, so callers can report coverage.

import type { SystemOneRequest, SystemOneResponse, Usage } from "./api.mts";
import { TypeSafeApiError, type Client } from "./client.mts";

export type ScanOptions = {
  /** Give the client a limiter; rate limits are applied there. */
  client: Client;
  /** Requests in flight at once. */
  concurrency?: number;
};

export type ScanSuccess<U> = { unit: U; response: SystemOneResponse };
export type ScanFailure<U> = { unit: U; error: unknown };

export type ScanReport<U> = {
  /** In input order. */
  succeeded: ScanSuccess<U>[];
  /** In input order. */
  failed: ScanFailure<U>[];
  usage: Usage;
  elapsedMs: number;
};

// Every later request would fail the same way: bad key, no access, no credit.
const FATAL_STATUS = new Set([401, 402, 403]);

export async function scanUnits<U>(
  units: readonly U[],
  toRequest: (unit: U) => SystemOneRequest,
  { client, concurrency = 32 }: ScanOptions,
): Promise<ScanReport<U>> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be an integer >= 1, got ${concurrency}`);
  }
  const started = performance.now();
  const outcomes: Array<ScanSuccess<U> | ScanFailure<U>> = new Array(units.length);
  let next = 0;
  let fatal: TypeSafeApiError | undefined;

  // A fixed pool of workers pulls units in order. Requests are built just
  // before they are sent, so memory stays flat for large scans.
  async function worker(): Promise<void> {
    while (next < units.length) {
      const index = next++;
      const unit = units[index] as U;
      if (fatal) {
        outcomes[index] = { unit, error: fatal };
        continue;
      }
      try {
        outcomes[index] = { unit, response: await client.systemOne(toRequest(unit)) };
      } catch (error) {
        if (error instanceof TypeSafeApiError && FATAL_STATUS.has(error.status)) fatal = error;
        outcomes[index] = { unit, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, units.length) }, worker));

  const succeeded: ScanSuccess<U>[] = [];
  const failed: ScanFailure<U>[] = [];
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  for (const outcome of outcomes) {
    if ("response" in outcome) {
      succeeded.push(outcome);
      usage.input_tokens += outcome.response.usage.input_tokens;
      usage.output_tokens += outcome.response.usage.output_tokens;
    } else {
      failed.push(outcome);
    }
  }
  return { succeeded, failed, usage, elapsedMs: performance.now() - started };
}
