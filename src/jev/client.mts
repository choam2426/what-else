// HTTP client for the System One API with retries. No dependencies.

import { estimateTokens, type SystemOneRequest, type SystemOneResponse } from "./api.mts";
import type { Limiter } from "./limiter.mts";

export const DEFAULT_BASE_URL = "https://api.typesafe.ai";
export const DEFAULT_MODEL = "jev-latest";

// 529 is TypeSafe's "overloaded"; 520-524 are Cloudflare origin errors (seen in
// the wild as an HTML 520 page). 400 covers bad requests, too many choices and
// max_tokens_exceeded, so it is never retried.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529]);

export type ClientOptions = {
  /** Defaults to the TYPESAFE_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to TYPESAFE_BASE_URL, then DEFAULT_BASE_URL. */
  baseUrl?: string;
  model?: string;
  /** Waited on before every attempt, retries included. */
  limiter?: Limiter;
  /** Retries after the first attempt. */
  maxRetries?: number;
  /** Per attempt, including reading the body. */
  timeoutMs?: number;
  baseDelayMs?: number;
  /** Caps every wait between attempts, Retry-After included. */
  maxDelayMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export type Client = {
  systemOne(request: SystemOneRequest): Promise<SystemOneResponse>;
};

/** The client cannot be used as configured. Fall back to grep. */
export class InvalidConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConfigError";
  }
}

export class MissingApiKeyError extends InvalidConfigError {
  constructor() {
    super("TYPESAFE_API_KEY is not set. Set it to scan with Jev, or fall back to grep.");
    this.name = "MissingApiKeyError";
  }
}

export class TypeSafeApiError extends Error {
  readonly status: number;
  /** e.g. "authentication_error", "api_usage_error", "max_tokens_exceeded". */
  readonly errorType: string | undefined;
  readonly requestId: string | undefined;
  readonly body: unknown;

  constructor(status: number, body: unknown, requestId: string | undefined) {
    const { errorType, message } = parseErrorBody(body);
    super(`TypeSafe API ${status}${errorType ? ` ${errorType}` : ""}: ${message ?? "request failed"}`);
    this.name = "TypeSafeApiError";
    this.status = status;
    this.errorType = errorType;
    this.requestId = requestId;
    this.body = body;
  }

  /** The state plus questions did not fit. Split the unit and retry. */
  get isContextLimit(): boolean {
    return this.errorType === "max_tokens_exceeded";
  }
}

/** A 200 whose body is not a System One response. Not retried. */
export class InvalidResponseError extends Error {
  readonly body: unknown;
  readonly requestId: string | undefined;

  constructor(body: unknown, requestId: string | undefined) {
    super("TypeSafe API returned 200 with an unexpected body");
    this.name = "InvalidResponseError";
    this.body = body;
    this.requestId = requestId;
  }
}

export function createClient(options: ClientOptions = {}): Client {
  const apiKey = (options.apiKey ?? process.env["TYPESAFE_API_KEY"] ?? "").trim();
  if (!apiKey) throw new MissingApiKeyError();
  const authorization = `Bearer ${apiKey}`;
  try {
    new Headers({ Authorization: authorization });
  } catch {
    throw new InvalidConfigError("TYPESAFE_API_KEY contains characters that are not allowed in an HTTP header.");
  }

  const baseUrl = options.baseUrl ?? process.env["TYPESAFE_BASE_URL"] ?? DEFAULT_BASE_URL;
  const endpoint = parseEndpoint(baseUrl);
  const model = options.model ?? DEFAULT_MODEL;
  const limiter = options.limiter;
  const maxRetries = check("maxRetries", options.maxRetries ?? 5, (n) => Number.isInteger(n) && n >= 0);
  const timeoutMs = check("timeoutMs", options.timeoutMs ?? 30_000, (n) => n > 0);
  const baseDelayMs = check("baseDelayMs", options.baseDelayMs ?? 500, (n) => n >= 0);
  const maxDelayMs = check("maxDelayMs", options.maxDelayMs ?? 20_000, (n) => n >= 0);
  const fetchFn = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  async function attempt(body: string): Promise<SystemOneResponse> {
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    const requestId = response.headers.get("x-typesafe-request-id") ?? undefined;
    if (!response.ok) {
      throw new HttpError(
        new TypeSafeApiError(response.status, parseJson(text), requestId),
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }
    const parsed = parseJson(text);
    if (!isSystemOneResponse(parsed)) throw new InvalidResponseError(parsed, requestId);
    return parsed;
  }

  return {
    async systemOne(request) {
      const fullRequest = { ...request, model: request.model ?? model };
      const body = JSON.stringify(fullRequest);
      const tokens = estimateTokens(fullRequest);
      for (let retry = 0; ; retry++) {
        await limiter?.acquire(tokens);
        try {
          return await attempt(body);
        } catch (error) {
          const apiError = error instanceof HttpError ? error.apiError : undefined;
          const retryable = apiError ? RETRYABLE_STATUS.has(apiError.status) : isTransientNetworkError(error);
          if (!retryable || retry >= maxRetries) throw apiError ?? error;

          // Exponential backoff with equal jitter, at least Retry-After, at most maxDelayMs.
          const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** retry);
          const backoff = ceiling / 2 + random() * (ceiling / 2);
          const retryAfterMs = error instanceof HttpError ? (error.retryAfterMs ?? 0) : 0;
          const delay = Math.min(maxDelayMs, Math.max(backoff, retryAfterMs));
          // The server is over its limit for everyone, not just this request.
          if (apiError?.status === 429) limiter?.pauseFor(delay);
          await sleep(delay);
        }
      }
    },
  };
}

class HttpError extends Error {
  readonly apiError: TypeSafeApiError;
  readonly retryAfterMs: number | undefined;

  constructor(apiError: TypeSafeApiError, retryAfterMs: number | undefined) {
    super(apiError.message);
    this.apiError = apiError;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(`${baseUrl.replace(/\/+$/, "")}/v1/systemone`);
  } catch {
    throw new InvalidConfigError(`Invalid TypeSafe base URL: "${baseUrl}". Expected e.g. ${DEFAULT_BASE_URL}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InvalidConfigError(`TypeSafe base URL must be http(s), got "${baseUrl}"`);
  }
  return url.href;
}

function check(name: string, value: number, valid: (n: number) => boolean): number {
  if (!Number.isFinite(value) || !valid(value)) throw new InvalidConfigError(`Invalid ${name}: ${value}`);
  return value;
}

function isTransientNetworkError(error: unknown): boolean {
  // AbortSignal.timeout rejects with a TimeoutError DOMException.
  if (error instanceof DOMException && error.name === "TimeoutError") return true;
  // Node's fetch reports socket failures as TypeError("fetch failed" or
  // "terminated") with the underlying error as `cause`. Bad headers, bad
  // URLs and plain bugs are TypeErrors with no cause or a TypeError cause.
  return error instanceof TypeError && error.cause instanceof Error && !(error.cause instanceof TypeError);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSystemOneResponse(body: unknown): body is SystemOneResponse {
  if (!isRecord(body) || !isRecord(body["answers"])) return false;
  const usage = body["usage"];
  return isRecord(usage) && typeof usage["input_tokens"] === "number" && typeof usage["output_tokens"] === "number";
}

// Seen: {"detail": "Too many choices..."} and {"detail": {"error_type", "message"}}.
// Also handles FastAPI-style {"detail": [{"msg": ...}]}.
function parseErrorBody(body: unknown): { errorType: string | undefined; message: string | undefined } {
  const detail = isRecord(body) ? body["detail"] : undefined;
  if (typeof detail === "string") return { errorType: undefined, message: detail };
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => (isRecord(item) && typeof item["msg"] === "string" ? [item["msg"]] : []));
    return { errorType: undefined, message: messages.length > 0 ? messages.join("; ") : undefined };
  }
  if (isRecord(detail)) {
    const errorType = detail["error_type"];
    const message = detail["message"];
    return {
      errorType: typeof errorType === "string" ? errorType : undefined,
      message: typeof message === "string" ? message : undefined,
    };
  }
  return { errorType: undefined, message: typeof body === "string" && body ? body : undefined };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
