// Reads a commit as a Phase 0 case: its pre-existing changed files, the seed hunk chosen by
// rule, and the ground truth (everything else). Shared by make-case.mts and screen.mts so
// both use exactly the same seed and truth.

import { execFileSync } from "node:child_process";

export const TEST = /(^|\/)(tests?|__tests__|spec|js_tests)\/|\.(test|spec)\.[jt]sx?$|(^|\/)test_[^/]+\.py$/i;
export const DOC = /(^|\/)docs?\/|\.(md|rst|txt)$/i;
const NOISE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|poetry\.lock|Cargo\.lock)$|(^|\/)(locale|locales|i18n)\/|\.po$|(^|\/)(AUTHORS|CONTRIBUTORS)(\.\w+)?$/i;

export type Hunk = {
  oldStart: number;
  oldLines: number;
  newLines: string[];
  oldText: string[];
  removed: number;
  added: number;
};
export type FileDiff = { path: string; status: string; hunks: Hunk[] };
export type TruthFile = { path: string; status: string; kind: "code" | "doc" | "test"; hunks: Array<{ start: number; end: number }> };

export type CommitCase = {
  commit: string;
  parent: string;
  message: string;
  files: FileDiff[];
  seedFile: FileDiff;
  seedHunk: Hunk;
  truth: TruthFile[];
};

export const kindOf = (path: string): TruthFile["kind"] => (TEST.test(path) ? "test" : DOC.test(path) ? "doc" : "code");

export function readCommit(repo: string, commit: string): CommitCase {
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { maxBuffer: 1 << 30 }).toString();
  const parent = git("rev-parse", `${commit}^`).trim();
  const full = git("rev-parse", commit).trim();
  const message = git("log", "-1", "--format=%B", full).trim();

  // "truth" hunks ignore whitespace-only changes. "seed" hunks are exact, and edits a few lines
  // apart are merged (with the unchanged lines between them) so one seed is one whole edit.
  const readHunks = (path: string, mode: "truth" | "seed"): Hunk[] => {
    const hunks: Hunk[] = [];
    let current: Hunk | undefined;
    const flags = mode === "truth" ? ["-w"] : ["--inter-hunk-context=3"];
    for (const l of git("diff", ...flags, "--unified=0", "--no-renames", parent, full, "--", path).split("\n")) {
      const m = l.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (m) {
        current = { oldStart: Number(m[1]), oldLines: m[2] === undefined ? 1 : Number(m[2]), newLines: [], oldText: [], removed: 0, added: 0 };
        hunks.push(current);
      } else if (current && l.startsWith("+") && !l.startsWith("+++")) {
        current.newLines.push(l.slice(1));
        current.added++;
      } else if (current && l.startsWith("-") && !l.startsWith("---")) {
        current.oldText.push(l.slice(1));
        current.removed++;
      } else if (current && l.startsWith(" ")) {
        current.newLines.push(l.slice(1));
        current.oldText.push(l.slice(1));
      }
    }
    return hunks;
  };

  // Pre-existing files only: added files cannot be found by scanning. -w drops whitespace-only hunks.
  const files: FileDiff[] = [];
  for (const line of git("diff", "--name-status", "--no-renames", parent, full).trim().split("\n")) {
    const [status, path] = line.split("\t");
    if (!status || !path || status === "A" || NOISE.test(path)) continue;
    const hunks = readHunks(path, "truth");
    if (hunks.length > 0 || status === "D") files.push({ path, status, hunks });
  }

  // The seed is chosen by rule so nobody picks it after reading the answer:
  // the largest hunk in the most-changed non-test, non-doc source file.
  const size = (h: Hunk) => h.added + h.removed;
  const total = (f: FileDiff) => f.hunks.reduce((s, h) => s + size(h), 0);
  const sourceFiles = files.filter((f) => f.status === "M" && kindOf(f.path) === "code");
  if (sourceFiles.length === 0) throw new Error("no non-test, non-doc source file to seed from");
  const seedFile = sourceFiles.reduce((a, b) => (total(b) > total(a) ? b : a));
  // The seed is applied to the snapshot, so it comes from the exact diff: a -w hunk leaves out
  // re-indented lines and would produce broken code. Truth keeps -w hunks, minus those the seed covers.
  const seedHunk = readHunks(seedFile.path, "seed").reduce((a, b) => (size(b) > size(a) ? b : a));
  const oldRange = (h: Hunk) => [h.oldStart, h.oldStart + Math.max(0, h.oldLines - 1)] as const;
  const [seedStart, seedEnd] = oldRange(seedHunk);
  const coveredBySeed = (h: Hunk) => {
    const [start, end] = oldRange(h);
    return start <= seedEnd && end >= seedStart;
  };

  const truth = files.flatMap((f): TruthFile[] => {
    const hunks = f.hunks
      .filter((h) => !(f === seedFile && coveredBySeed(h)))
      .map((h) => ({ start: Math.max(1, h.oldStart), end: h.oldStart + Math.max(0, h.oldLines - 1) }));
    if (f.status !== "D" && hunks.length === 0) return [];
    return [{ path: f.path, status: f.status, kind: kindOf(f.path), hunks }];
  });

  return { commit: full, parent, message, files, seedFile, seedHunk, truth };
}
