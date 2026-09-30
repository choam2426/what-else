import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SystemOneRequest, SystemOneResponse } from "../src/jev/api.mts";
import { TypeSafeApiError, type Client } from "../src/jev/client.mts";
import { scanUnits } from "../src/jev/scan.mts";

const toRequest = (unit: string): SystemOneRequest => ({
  state: unit,
  questions: { a: { type: "noul", instructions: "?" } },
});

function response(): SystemOneResponse {
  return { model: "jev-1.13.0", answers: { a: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 300, output_tokens: 20 } };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("scanUnits", () => {
  it("collects successes and failures in input order with total usage", async () => {
    const client: Client = {
      async systemOne(request) {
        if (request.state === "bad") throw new TypeSafeApiError(400, { detail: { error_type: "max_tokens_exceeded" } }, undefined);
        return response();
      },
    };
    const report = await scanUnits(["a", "bad", "b", "c"], toRequest, { client, concurrency: 2 });

    assert.deepEqual(report.succeeded.map((s) => s.unit), ["a", "b", "c"]);
    assert.deepEqual(report.failed.map((f) => f.unit), ["bad"]);
    assert.deepEqual(report.usage, { input_tokens: 900, output_tokens: 60 });
  });

  it("records a failure when building the request throws", async () => {
    const client: Client = { systemOne: async () => response() };
    const report = await scanUnits(
      ["a"],
      () => {
        throw new RangeError("too many lines");
      },
      { client },
    );
    assert.ok(report.failed[0]?.error instanceof RangeError);
  });

  it("caps requests in flight and builds requests lazily", async () => {
    let active = 0;
    let peak = 0;
    let built = 0;
    let builtAtFirstCall: number | undefined;
    const client: Client = {
      async systemOne() {
        builtAtFirstCall ??= built;
        active++;
        peak = Math.max(peak, active);
        await tick();
        active--;
        return response();
      },
    };
    const units = Array.from({ length: 50 }, (_, i) => `u${i}`);
    await scanUnits(units, (unit) => (built++, toRequest(unit)), { client, concurrency: 4 });

    assert.equal(peak, 4);
    assert.ok((builtAtFirstCall ?? Infinity) <= 4);
  });

  for (const status of [401, 403]) {
    it(`stops calling the API after a ${status}, without waiting`, async () => {
      let calls = 0;
      const client: Client = {
        async systemOne() {
          calls++;
          await tick();
          throw new TypeSafeApiError(status, { detail: { error_type: "authentication_error" } }, undefined);
        },
      };
      const units = Array.from({ length: 10_000 }, (_, i) => `u${i}`);
      const started = performance.now();
      const report = await scanUnits(units, toRequest, { client, concurrency: 8 });

      assert.ok(calls <= 8);
      assert.equal(report.failed.length, 10_000);
      assert.ok(performance.now() - started < 1000);
    });
  }

  it("rejects a bad concurrency", async () => {
    const client: Client = { systemOne: async () => response() };
    await assert.rejects(scanUnits(["a"], toRequest, { client, concurrency: 0 }), RangeError);
  });
});
