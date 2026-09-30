import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lineChoice, numberLines } from "../src/jev/lines.mts";

describe("numberLines", () => {
  it("prefixes lines and maps ids back to file lines", () => {
    const lines = numberLines("def add(a, b):\r\n    return a + b\n", 40);

    assert.equal(lines.text, "L001| def add(a, b):\nL002|     return a + b");
    assert.deepEqual(lines.ids, ["L001", "L002"]);
    assert.equal(lines.lineOf("L002"), 41);
    assert.throws(() => lines.lineOf("L003"), /Unknown line id/);
  });

  it("widens ids past 999 lines", () => {
    const lines = numberLines(Array.from({ length: 1000 }, () => "x").join("\n"));
    assert.equal(lines.ids[0], "L0001");
    assert.equal(lines.ids.at(-1), "L1000");
  });
});

describe("lineChoice", () => {
  it("offers every line id as an option", () => {
    const question = lineChoice(numberLines("a\nb"), "Which line?");
    assert.deepEqual(question, { type: "choice", instructions: "Which line?", criteria: { L001: null, L002: null } });
  });

  it("rejects units over 255 lines", () => {
    const lines = numberLines(Array.from({ length: 256 }, () => "x").join("\n"));
    assert.throws(() => lineChoice(lines, "Which line?"), RangeError);
  });
});
