// Phase 0 setup step (docs/records/phase0-experiment.md §2): once per repository, an agent reads
// the repository at a cutoff commit plus a co-change digest of the history before it, and writes
// repository rules. Arms S-nojev and S add those rules to the methodology. This is the first
// prototype of what the setup skill will do.
//
// The cutoff must come before every case commit the rules will be used on, so the rules cannot
// contain an answer.
//
// Usage: node bench/setup.mts <repo> <cutoff-commit> <out-dir> [--since 2025-01-01] [--model sonnet]
// Writes <out-dir>/cochange.md, setup.json (raw harness result) and rules.md. An existing setup.json
// is reused (only rules.md is rendered again); pass --force to run the agent again.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { digest, readHistory } from "./cochange.mts";
import { commitSnapshot, exportTree } from "./snapshot.mts";

const [repo, cutoff, outDir] = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
if (!repo || !cutoff || !outDir) {
  console.error("usage: node bench/setup.mts <repo> <cutoff-commit> <out-dir> [--since 2025-01-01] [--model sonnet]");
  process.exit(2);
}
const snapshot = join(outDir, "snapshot");
if (!existsSync(snapshot)) {
  exportTree(repo, cutoff, snapshot);
  commitSnapshot(snapshot);
}
const cochange = digest(readHistory(repo, cutoff, opt("since", "2025-01-01")));
writeFileSync(join(outDir, "cochange.md"), cochange);

const prompt = `You are preparing change-scope rules for this repository.

Later, an agent making a change here will use your rules to find every other place that must also change. That agent already follows a general method with these axes: A. uses, B. parallels (same file, other implementations, siblings with the same role), C. the same decision applied from another path, D. boundaries (schemas, type declarations, settings, specs), E. repository conventions (release notes, changelog, reference docs, deprecation notes), F. tests, G. things no longer needed.
Your rules add what is specific to this repository, mainly for B, C, D and E.

You have the repository files (there is no git history) and a digest of which files changed together in its recent history, below.

Write four sections:
1. conventions: for each kind of change (for example a new public API, a behavior change, a bug fix in a released version, a deprecation, dropping support for a version), which files are also updated and how to find the right one (for example how to tell which release notes file is current). Read the contributing docs and the files themselves.
2. siblings: groups of files or directories with the same role, where a change to one member often needs the same change in the others (for example backend implementations or commands). Give the paths and what they share.
3. pairs: places where the same decision or rule is implemented more than once, reached from different entry points. Give the paths and how you know.
4. boundaries: where this repository declares contracts outside the implementation (type stubs, schemas, settings references, checks, docs of public APIs), and when they need updating.

The rules will be used for changes you cannot see now, so write them as general rules about kinds of changes. Check each rule against the repository files. At most 12 items per section, each short.
Your work is read-only: you report rules.

${cochange}`;

const text = { type: "string" };
const list = (properties: Record<string, unknown>) => ({ type: "array", items: { type: "object", properties, required: Object.keys(properties) } });
const schema = {
  type: "object",
  properties: {
    conventions: list({ when: text, update: text, how_to_find: text }),
    siblings: list({ role: text, members: text, keep_consistent: text }),
    pairs: list({ decision: text, paths: text, evidence: text }),
    boundaries: list({ contract: text, where: text, when: text }),
  },
  required: ["conventions", "siblings", "pairs", "boundaries"],
};

function runSetupAgent(): { wallMs: number; result: Parsed } {
  const started = Date.now();
  const run = spawnSync("claude", [
    "-p", prompt,
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--model", opt("model", "sonnet"),
    // Same isolation as the arms (run-agent.mts).
    "--setting-sources", "project",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--permission-mode", "dontAsk",
    "--allowedTools", "Read", "Grep", "Glob", "Bash", "Agent",
    "--disallowedTools", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch",
    "--no-session-persistence",
  ], { cwd: snapshot, encoding: "utf8", maxBuffer: 1 << 28 });
  const wallMs = Date.now() - started;
  try {
    return { wallMs, result: JSON.parse(run.stdout) };
  } catch {
    return { wallMs, result: { parseError: true, stdout: run.stdout, stderr: run.stderr, status: run.status } };
  }
}

type Parsed = { structured_output?: Rules; total_cost_usd?: number } & Record<string, unknown>;
const setupPath = join(outDir, "setup.json");
const reuse = existsSync(setupPath) && !process.argv.includes("--force");
const { wallMs, result: parsed } = reuse ? (JSON.parse(readFileSync(setupPath, "utf8")) as { wallMs: number; result: Parsed }) : runSetupAgent();
if (!reuse) writeFileSync(setupPath, JSON.stringify({ repo, cutoff, wallMs, result: parsed }, null, 2));

type Rules = {
  conventions: Array<{ when: string; update: string; how_to_find: string }>;
  siblings: Array<{ role: string; members: string; keep_consistent: string }>;
  pairs: Array<{ decision: string; paths: string; evidence: string }>;
  boundaries: Array<{ contract: string; where: string; when: string }>;
};
const rules = parsed.structured_output;
if (!rules) {
  console.error(`setup failed: see ${join(outDir, "setup.json")}`);
  process.exit(1);
}
const md = [
  "## Rules for this repository",
  "",
  "These rules were prepared from this repository's files and history. Use them together with the axes above.",
  "",
  "### Conventions (axis E)",
  ...rules.conventions.map((r) => `- **${r.when}**
  - Update: ${r.update}
  - How to find it: ${r.how_to_find}`),
  "",
  "### Siblings (axis B)",
  ...rules.siblings.map((r) => `- **${r.role}**
  - Members: ${r.members}
  - Keep consistent: ${r.keep_consistent}`),
  "",
  "### Same decision in more than one place (axis C)",
  ...rules.pairs.map((r) => `- **${r.decision}**
  - Where: ${r.paths}
  - Evidence: ${r.evidence}`),
  "",
  "### Boundaries (axis D)",
  ...rules.boundaries.map((r) => `- **${r.contract}**
  - Where: ${r.where}
  - When: ${r.when}`),
  "",
].join("\n");
writeFileSync(join(outDir, "rules.md"), md);
console.log(`wrote ${join(outDir, "rules.md")} (${Math.round(wallMs / 1000)}s, $${(parsed.total_cost_usd ?? 0).toFixed(2)} list)`);
