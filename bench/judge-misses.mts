// Judges the misses of a realistic run against the agent's own implementation: for each required
// file the agent left unchanged, is it still needed given how the agent did the change? The real
// commit may have implemented the request differently, so some "misses" are not misses at all.
// The judge sees the request, the agent's diff and, per missed file, what the real commit changed
// there. It is told nothing about which arm produced the run.
//
// Usage: node bench/judge-misses.mts <case-dir> <run-name> --labels a.json[,b.json] [--model sonnet]
// Writes runs/<run-name>.judge.json: { missed: [{ path, needed, why }] }.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const [caseDir, runName] = process.argv.slice(2);
const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const labelFiles = (opt("labels") ?? "").split(",").filter(Boolean);
if (!caseDir || !runName || labelFiles.length === 0) {
  console.error("usage: node bench/judge-misses.mts <case-dir> <run-name> --labels a.json[,b.json] [--model sonnet]");
  process.exit(2);
}
const labels = labelFiles.reduce((all, f) => ({ ...all, ...JSON.parse(readFileSync(f, "utf8")) }), {} as Record<string, Record<string, { label: string }>>);
const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8")) as { repo: string; commit: string; request: string; seed: { path: string }; controlled?: boolean; goldPatch?: string };
const run = JSON.parse(readFileSync(join(caseDir, "runs", `${runName}.json`), "utf8")) as { changed: Array<{ path: string }> };
const agentDiff = readFileSync(join(caseDir, "runs", `${runName}.diff`), "utf8");

const id = basename(caseDir);
const required = Object.entries(labels[id] ?? {}).filter(([, v]) => v.label === "required").map(([p]) => p);
if (!kase.controlled && !required.includes(kase.seed.path)) required.push(kase.seed.path);
const changed = new Set(run.changed.map((c) => c.path));
const missed = required.filter((p) => !changed.has(p));
const out = join(caseDir, "runs", `${runName}.judge.json`);
if (missed.length === 0) {
  writeFileSync(out, JSON.stringify({ missed: [] }, null, 2));
  console.log(`${id} ${runName}: nothing missed`);
  process.exit(0);
}

const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}\n...[truncated]`);
// The reference change for one file: from the case's gold patch when it has one (SWE-bench Pro),
// otherwise from the real commit.
const goldFor = (path: string) => {
  if (kase.goldPatch) {
    const block = kase.goldPatch.split(/^(?=diff --git )/m).find((b) => b.startsWith(`diff --git a/${path} `));
    return block ?? "(not in the reference patch)";
  }
  try {
    return execFileSync("git", ["-C", kase.repo, "show", "-w", "--format=", kase.commit, "--", path], { maxBuffer: 1 << 26 }).toString();
  } catch {
    return "(not available)";
  }
};

const prompt = `You are reviewing a finished code change. An agent was given a request and made the change shown below. A reference implementation of the same request also changed some files that the agent left unchanged. For each of those files, decide whether it still needs to change *given the agent's own implementation*.

A file is needed when, with the agent's change as it stands, leaving that file unchanged would leave the codebase broken, wrong, inconsistent, or missing something this repository's conventions require for this kind of change (for example documentation or release notes for a user-facing change, a deprecation entry, a parallel implementation that must match). A file is not needed when the agent's implementation made it unnecessary, or when the reference change there was optional polish.

## Request
${cut(kase.request, 6000)}

## The agent's change
\`\`\`diff
${cut(agentDiff, 40000)}
\`\`\`

## Files the agent left unchanged, with what the reference implementation did there
${missed.map((p) => `### ${p}\n\`\`\`diff\n${cut(goldFor(p), 5000)}\n\`\`\``).join("\n\n")}

Answer for every file listed.`;

const schema = {
  type: "object",
  properties: { missed: { type: "array", items: { type: "object", properties: { path: { type: "string" }, needed: { type: "boolean" }, why: { type: "string" } }, required: ["path", "needed", "why"] } } },
  required: ["missed"],
};
const r = spawnSync("claude", [
  "-p", prompt,
  "--output-format", "json",
  "--json-schema", JSON.stringify(schema),
  "--model", opt("model") ?? "sonnet",
  "--setting-sources", "project",
  "--strict-mcp-config",
  "--disable-slash-commands",
  "--permission-mode", "dontAsk",
  "--no-session-persistence",
], { cwd: caseDir, encoding: "utf8", maxBuffer: 1 << 26 });
let parsed: { structured_output?: { missed: Array<{ path: string; needed: boolean; why: string }> }; total_cost_usd?: number } = {};
try {
  parsed = JSON.parse(r.stdout);
} catch {
  // fall through to the failure report below
}
if (!parsed.structured_output) {
  console.error(`${id} ${runName}: judge failed ${r.stderr.slice(0, 200)}`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify({ ...parsed.structured_output, costUsd: parsed.total_cost_usd ?? 0 }, null, 2));
const notNeeded = parsed.structured_output.missed.filter((m) => !m.needed).length;
console.log(`${id} ${runName}: ${missed.length} missed, judge says ${notNeeded} not needed ($${(parsed.total_cost_usd ?? 0).toFixed(2)})`);
