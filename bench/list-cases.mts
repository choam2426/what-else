// Lists commits that can become Phase 0 cases (phase0-experiment.md §4 filters), with the
// ground truth each would have. Prints one JSON line per usable commit.
//
// Usage: node bench/list-cases.mts <repo-dir> [--since 2026-07-01] [--min-nontest 2]

import { execFileSync } from "node:child_process";

import { readCommit } from "./commit.mts";

const [repo] = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const since = opt("since", "2026-07-01");
const minNonTest = Number(opt("min-nontest", "2"));
if (!repo) {
  console.error("usage: node bench/list-cases.mts <repo-dir> [--since 2026-07-01] [--min-nontest 2]");
  process.exit(2);
}

const BOT = /bot|dependabot|renovate|github-actions|weblate|crowdin|pre-commit/i;
const SUBJECT = /^(chore\(deps|bump |build\(deps|merge |revert|new crowdin|translations?|update .*translation|release|v?\d+\.\d+|changelog|chore: release)/i;

const log = execFileSync("git", ["-C", repo, "log", "--first-parent", "--no-merges", `--since=${since}`, "--format=%H%x09%an%x09%ae%x09%ad%x09%s", "--date=short"], { maxBuffer: 1 << 28 })
  .toString()
  .trim()
  .split("\n");

for (const line of log) {
  const [sha, author, email, date, subject] = line.split("\t");
  if (!sha || !subject || BOT.test(author ?? "") || BOT.test(email ?? "") || SUBJECT.test(subject)) continue;
  const names = execFileSync("git", ["-C", repo, "show", "--name-status", "--format=", sha]).toString().trim().split("\n");
  if (names.some((n) => n.startsWith("R"))) continue;
  const preExisting = names.filter((n) => /^[MD]\t/.test(n)).length;
  if (preExisting < 3 || preExisting > 15) continue;
  try {
    const c = readCommit(repo, sha);
    const nonTest = c.truth.filter((t) => t.kind !== "test");
    if (nonTest.length < minNonTest) continue;
    console.log(JSON.stringify({
      sha: sha.slice(0, 10), date, subject: subject.slice(0, 90),
      seed: c.seedFile.path,
      code: c.truth.filter((t) => t.kind === "code").length,
      doc: c.truth.filter((t) => t.kind === "doc").length,
      test: c.truth.filter((t) => t.kind === "test").length,
    }));
  } catch {
    // No usable seed (e.g. docs-only commit): not a case.
  }
}
