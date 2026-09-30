// Line ids for the semantic find pattern: prefix each line with an id,
// then ask a choice question whose options are those ids.

import { MAX_CHOICES, type ChoiceQuestion, type Instructions } from "./api.mts";

export type NumberedLines = {
  /** The code with each line prefixed, e.g. "L001| const x = 1;". */
  text: string;
  ids: string[];
  /** The 1-based line number in the source file for a line id. */
  lineOf(id: string): number;
};

/**
 * @param startLine The source line number of the first line of `code`,
 *   so ids map back to file positions when `code` is a slice of a file.
 */
export function numberLines(code: string, startLine = 1): NumberedLines {
  const lines = code.split(/\r?\n/);
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();

  const width = Math.max(3, String(lines.length).length);
  const ids = lines.map((_, i) => `L${String(i + 1).padStart(width, "0")}`);
  const lineNumbers = new Map(ids.map((id, i) => [id, startLine + i]));

  return {
    text: lines.map((line, i) => `${ids[i]}| ${line}`).join("\n"),
    ids,
    lineOf(id) {
      const line = lineNumbers.get(id);
      if (line === undefined) throw new Error(`Unknown line id: ${id}`);
      return line;
    },
  };
}

export function lineChoice(lines: NumberedLines, instructions: Instructions): ChoiceQuestion {
  if (lines.ids.length > MAX_CHOICES) {
    throw new RangeError(`A choice allows at most ${MAX_CHOICES} options, got ${lines.ids.length} lines. Split the unit.`);
  }
  return {
    type: "choice",
    instructions,
    criteria: Object.fromEntries(lines.ids.map((id) => [id, null])),
  };
}
