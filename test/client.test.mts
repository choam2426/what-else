import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createClient,
  InvalidConfigError,
  InvalidResponseError,
  MissingApiKeyError,
  TypeSafeApiError,
  type ClientOptions,
} from "../src/jev/client.mts";
import type { Limiter } from "../src/jev/limiter.mts";

const OK_BODY = {
  model: "jev-1.13.0",
  answers: { a: { type: "noul", noul: 0.9 } },
  usage: { input_tokens: 300, output_tokens: 20 },
};
const REQUEST = { state: "x", questions: { a: { type: "noul" as const, instructions: "Is this x?" } } };

type Reply = { status: number; body: unknown; headers?: Record<string, string> } | Error;

function fakeFetch(replies: Reply[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (reply === undefined) throw new Error("unexpected extra fetch");
    if (reply instanceof Error) throw reply;
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status, headers: reply.headers ?? {} });
  }) as typeof fetch;
  return { fetchFn, calls };
}

function client(replies: Reply[], options: ClientOptions = {}) {
  const { fetchFn, calls } = fakeFetch(replies);
  const sleeps: number[] = [];
  const c = createClient({
    apiKey: "test-key",
    baseUrl: "https://api.example.test/",
    fetch: fetchFn,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 1,
    ...options,
  });
  return { client: c, calls, sleeps };
}

const networkError = () => new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED") });

describe("createClient config", () => {
  it("throws MissingApiKeyError without a key", () => {
    const saved = process.env["TYPESAFE_API_KEY"];
    delete process.env["TYPESAFE_API_KEY"];
    try {
      assert.throws(() => createClient(), MissingApiKeyError);
      assert.throws(() => createClient({ apiKey: "  " }), MissingApiKeyError);
    } finally {
      if (saved !== undefined) process.env["TYPESAFE_API_KEY"] = saved;
    }
  });

  it("rejects keys that cannot be sent as a header", () => {
    assert.throws(() => createClient({ apiKey: "sk-키" }), InvalidConfigError);
    assert.throws(() => createClient({ apiKey: "sk\nbad" }), InvalidConfigError);
  });

  it("rejects base URLs without an http(s) scheme", () => {
    assert.throws(() => createClient({ apiKey: "k", baseUrl: "127.0.0.1:9" }), InvalidConfigError);
    assert.throws(() => createClient({ apiKey: "k", baseUrl: "localhost:8080" }), InvalidConfigError);
  });

  it("rejects non-finite or negative numeric options", () => {
    assert.throws(() => createClient({ apiKey: "k", maxRetries: Number.NaN }), InvalidConfigError);
    assert.throws(() => createClient({ apiKey: "k", maxRetries: 1.5 }), InvalidConfigError);
    assert.throws(() => createClient({ apiKey: "k", timeoutMs: 0 }), InvalidConfigError);
    assert.throws(() => createClient({ apiKey: "k", maxDelayMs: -1 }), InvalidConfigError);
  });
});

describe("systemOne", () => {
  it("posts to /v1/systemone with auth and the default model", async () => {
    const { client: c, calls } = client([{ status: 200, body: OK_BODY }]);
    const response = await c.systemOne(REQUEST);

    assert.deepEqual(response, OK_BODY);
    assert.equal(calls[0]?.url, "https://api.example.test/v1/systemone");
    assert.equal((calls[0]?.init.headers as Record<string, string>)["Authorization"], "Bearer test-key");
    assert.equal(JSON.parse(calls[0]?.init.body as string).model, "jev-latest");
  });

  it("retries 429 and 529 with exponential backoff", async () => {
    const { client: c, calls, sleeps } = client([
      { status: 429, body: {} },
      { status: 529, body: {} },
      { status: 200, body: OK_BODY },
    ]);
    await c.systemOne(REQUEST);

    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [500, 1000]);
  });

  it("waits at least Retry-After, capped at maxDelayMs", async () => {
    const { client: c, sleeps } = client(
      [
        { status: 429, body: {}, headers: { "retry-after": "3" } },
        { status: 429, body: {}, headers: { "retry-after": "3600" } },
        { status: 200, body: OK_BODY },
      ],
      { maxDelayMs: 10_000 },
    );
    await c.systemOne(REQUEST);

    assert.deepEqual(sleeps, [3000, 10_000]);
  });

  it("retries network errors and timeouts", async () => {
    const { client: c, calls } = client([
      networkError(),
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
      { status: 200, body: OK_BODY },
    ]);
    await c.systemOne(REQUEST);

    assert.equal(calls.length, 3);
  });

  it("does not retry TypeErrors that are not network failures", async () => {
    const { client: c, calls } = client([new TypeError("Cannot read properties of undefined")]);
    await assert.rejects(c.systemOne(REQUEST), /Cannot read properties/);
    assert.equal(calls.length, 1);
  });

  it("gives up after maxRetries", async () => {
    const { client: c, calls } = client(
      [
        { status: 529, body: {} },
        { status: 529, body: {} },
        { status: 529, body: {} },
      ],
      { maxRetries: 2 },
    );
    await assert.rejects(c.systemOne(REQUEST), (error: TypeSafeApiError) => error.status === 529);
    assert.equal(calls.length, 3);
  });

  it("does not retry 400 and flags the context limit", async () => {
    const { client: c, calls } = client([
      {
        status: 400,
        body: { detail: { error_type: "max_tokens_exceeded" } },
        headers: { "x-typesafe-request-id": "req_123" },
      },
    ]);
    await assert.rejects(c.systemOne(REQUEST), (error: TypeSafeApiError) => {
      assert.equal(error.isContextLimit, true);
      assert.equal(error.requestId, "req_123");
      return true;
    });
    assert.equal(calls.length, 1);
  });

  it("reads string, array and non-JSON error bodies", async () => {
    const { client: c } = client([
      { status: 400, body: { detail: "Too many choices. Must have at most 255 choices." } },
      { status: 422, body: { detail: [{ loc: ["body"], msg: "field required" }, { msg: "bad type" }] } },
      { status: 400, body: "upstream exploded" },
    ]);
    await assert.rejects(c.systemOne(REQUEST), /Too many choices/);
    await assert.rejects(c.systemOne(REQUEST), /field required; bad type/);
    await assert.rejects(c.systemOne(REQUEST), /upstream exploded/);
  });

  it("rejects a malformed 200 without retrying", async () => {
    const { client: c, calls } = client([{ status: 200, body: { model: "jev-1.13.0", answers: {} } }]);
    await assert.rejects(c.systemOne(REQUEST), InvalidResponseError);
    assert.equal(calls.length, 1);
  });

  it("acquires the limiter before every attempt and pauses it on 429", async () => {
    const acquired: number[] = [];
    const paused: number[] = [];
    const limiter: Limiter = {
      acquire: async (tokens) => void acquired.push(tokens),
      pauseFor: (ms) => void paused.push(ms),
    };
    const { client: c } = client(
      [
        { status: 429, body: {} },
        { status: 529, body: {} },
        { status: 200, body: OK_BODY },
      ],
      { limiter },
    );
    await c.systemOne(REQUEST);

    assert.equal(acquired.length, 3);
    assert.ok(acquired.every((tokens) => tokens > 270));
    assert.deepEqual(paused, [500]);
  });
});
