import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estimateTokens, getChoice, getNoul, REQUEST_OVERHEAD_TOKENS, type SystemOneResponse } from "../src/jev/api.mts";

const question = { a: { type: "noul" as const, instructions: "?" } };

describe("estimateTokens", () => {
  it("adds the fixed overhead", () => {
    assert.ok(estimateTokens({ state: "", questions: {} }) > REQUEST_OVERHEAD_TOKENS);
  });

  it("counts non-ASCII text by its UTF-8 size", () => {
    const ascii = estimateTokens({ state: "a".repeat(300), questions: question }) - REQUEST_OVERHEAD_TOKENS;
    const korean = estimateTokens({ state: "가".repeat(300), questions: question }) - REQUEST_OVERHEAD_TOKENS;
    assert.ok(korean > ascii * 2);
  });
});

describe("answer accessors", () => {
  const response: SystemOneResponse = {
    model: "jev-1.13.0",
    answers: {
      a: { type: "noul", noul: 0.8 },
      line: { type: "choice", choice: "L002", probabilities: { L001: 0, L002: 1 }, confidence: 1 },
    },
    usage: { input_tokens: 300, output_tokens: 40 },
  };

  it("returns typed answers", () => {
    assert.equal(getNoul(response, "a"), 0.8);
    assert.equal(getChoice(response, "line").choice, "L002");
  });

  it("throws on a missing or mistyped answer", () => {
    assert.throws(() => getNoul(response, "missing"), /No answer/);
    assert.throws(() => getNoul(response, "line"), /expected noul/);
  });
});
