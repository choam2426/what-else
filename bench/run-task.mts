// Runs one realistic task (docs/records/e2e-benchmark.md §11): the request goes to the harness as a
// user would type it, the agent makes the change, and its final diff is kept for scoring.
// Each run works in a fresh clone of the case's snapshot, so runs never see each other's edits.
//
// Usage: node bench/run-task.mts <real-case-dir> <run-name> [--model sonnet]
// Writes runs/<run-name>.json (harness result, changed files, cost, time), runs/<run-name>.diff and
// runs/<run-name>.events.jsonl. Needs TYPESAFE_API_KEY when the snapshot has an implementation.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [caseDir, runName] = process.argv.slice(2);
const i = process.argv.indexOf("--model");
const model = i > 0 ? process.argv[i + 1]! : "sonnet";
if (!caseDir || !runName) {
  console.error("usage: node bench/run-task.mts <real-case-dir> <run-name> [--model sonnet]");
  process.exit(2);
}
const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8")) as { request: string };
const runs = resolve(caseDir, "runs");
mkdirSync(runs, { recursive: true });
const work = resolve(caseDir, "work", runName);
rmSync(work, { recursive: true, force: true });
const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, "-c", "core.longpaths=true", "-c", "core.quotepath=off", ...args], { maxBuffer: 1 << 30 }).toString();
execFileSync("git", ["-c", "core.longpaths=true", "clone", "-q", "--no-hardlinks", resolve(caseDir, "snapshot"), work]);
// The clone's origin is the local snapshot; drop it so the work tree looks like any checkout.
git(work, "remote", "remove", "origin");

const started = Date.now();
const run = spawnSync("claude", [
  "-p", kase.request,
  "--output-format", "stream-json", "--verbose",
  "--model", model,
  // A user's session: project settings, skills on, edits and the shell allowed. Web access is off,
  // so the real commit cannot be looked up; JevGrep reaches Jev through the shell.
  "--setting-sources", "project",
  "--strict-mcp-config",
  "--permission-mode", "dontAsk",
  "--allowedTools", "Read", "Grep", "Glob", "Bash", "Edit", "Write", "Agent", "Skill",
  "--disallowedTools", "WebFetch", "WebSearch", "Bash(gh:*)", "Bash(git clone:*)", "Bash(git fetch:*)", "Bash(git pull:*)", "Bash(git remote add:*)",
  "--no-session-persistence",
], { cwd: work, encoding: "utf8", maxBuffer: 1 << 28, env: process.env });
const wallMs = Date.now() - started;

const events = run.stdout.split("\n").filter((l) => l.startsWith("{"));
writeFileSync(join(runs, `${runName}.events.jsonl`), events.map((l) => l + "\n").join(""));
const result = events.map((l) => JSON.parse(l) as { type?: string; is_error?: boolean; total_cost_usd?: number }).reverse().find((e) => e.type === "result");

// The change the agent made: tracked edits and new files, minus the implementation's own runtime
// files (logs, caches) under .claude/.
git(work, "add", "-A", "--", ".", ":(exclude).claude");
const changed = git(work, "diff", "--cached", "--name-status", "--no-renames").split("\n").filter(Boolean).map((l) => {
  const [status, path] = l.split("\t");
  return { status: status ?? "", path: path ?? "" };
});
writeFileSync(join(runs, `${runName}.diff`), git(work, "diff", "--cached", "--no-renames"));

// Keep what the implementation wrote under .claude/ during the run (JevGrep logs with request
// counts), since the work tree is deleted below. Caches are skipped: they are large and not evidence.
const artifacts = git(work, "status", "--porcelain", "--ignored", "-uall", "--", ".claude").split("\n").filter(Boolean)
  .map((l) => l.slice(3)).filter((p) => (/\.jsonl$/.test(p) || /(^|\/)(runs|records)\/.*\.json$/.test(p)) && !/cache/i.test(p));
const jevLogs: Record<string, string> = {};
for (const p of artifacts) jevLogs[p] = readFileSync(join(work, p), "utf8");
if (artifacts.length) writeFileSync(join(runs, `${runName}.claude-logs.json`), JSON.stringify(jevLogs, null, 2));

const failed = !result || result.is_error === true;
const out = join(runs, failed ? `${runName}.failed.json` : `${runName}.json`);
writeFileSync(out, JSON.stringify({ model, wallMs, changed, result: result ?? { parseError: true, stderr: run.stderr.slice(-2000) } }, null, 2));
rmSync(work, { recursive: true, force: true });
console.log(`${failed ? "FAILED" : "wrote"} ${out} (${Math.round(wallMs / 1000)}s, $${(result?.total_cost_usd ?? 0).toFixed(2)}, ${changed.length} files changed)`);
if (failed) process.exitCode = 1;
