// End-to-end test of the setup guide (INSTALL.md and guide/; up to v0.7 it was the skill
// skill/jevgrep-setup, archived in docs/records/spec-v0.7): an agent sets up change-scope finding in
// a repository from the guide alone, and the implementation it produces is then installed into each case and
// measured with the plain task (run-agent.mts arm E).
//
// Usage:
//   node bench/run-e2e.mts setup <setup-repo> <message> [--model sonnet] [--effort medium]
//     One turn of the setup conversation. The first turn copies INSTALL.md and guide/ into
//     <setup-repo>/.what-else (the setup agent cannot reach GitHub) and starts a session; later turns continue it.
//     Each turn is logged to <setup-repo>/../setup.turns.jsonl and setup.events.jsonl.
//   node bench/run-e2e.mts record <setup-repo>
//     Records what the agent produced (<setup-repo>/../implementation.json).
//   node bench/run-e2e.mts install <setup-repo> <case-dir>
//     Copies the implementation into the case snapshot (spec excluded) and records it in
//     <case-dir>/runs/installed.json.
// Needs TYPESAFE_API_KEY: the setup agent checks JevGrep against the real API.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SPEC_DIR = ".what-else";
const [command, ...rest] = process.argv.slice(2);
const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, "-c", "core.quotepath=off", ...args], { maxBuffer: 1 << 30 }).toString();

type Implementation = { added: string[]; modified: string[]; patch: string };

// One turn of the setup conversation. The first call starts the session with the spec in place;
// later calls continue it, so a person (or an agent playing one) can answer the agent's questions.
function setup(repo: string, message: string) {
  if (!process.env["TYPESAFE_API_KEY"]) throw new Error("setup needs TYPESAFE_API_KEY in the environment");
  const out = dirname(resolve(repo));
  const sessionFile = join(out, "setup.session");
  const first = !existsSync(sessionFile);
  if (first) {
    rmSync(join(repo, SPEC_DIR), { recursive: true, force: true });
    for (const p of ["INSTALL.md", "guide"]) cpSync(fileURLToPath(new URL("../" + p, import.meta.url)), join(repo, SPEC_DIR, p), { recursive: true });
    writeFileSync(sessionFile, randomUUID());
  }
  const session = readFileSync(sessionFile, "utf8").trim();

  const started = Date.now();
  const run = spawnSync("claude", [
    "-p", message,
    ...(first ? ["--session-id", session] : ["--resume", session]),
    "--output-format", "stream-json", "--verbose",
    "--model", opt("model") ?? "sonnet",
    "--effort", opt("effort") ?? "medium",
    // Project settings only, so the user's own skills and agents stay out; skills stay enabled.
    "--setting-sources", "project",
    "--strict-mcp-config",
    // Setup writes skills and agents under .claude/, a protected path that neither the Write tool
    // nor Bash may touch in dontAsk mode, so setup runs in bypass mode. Deny rules still apply in
    // bypass mode: they keep file tools out of the user's home (their own agent settings) and keep
    // the agent away from the repository's future commits. Bash can still reach both, so audit()
    // checks every command in the log.
    "--permission-mode", "bypassPermissions",
    "--disallowedTools", "WebSearch", "WebFetch(domain:github.com)", "WebFetch(domain:api.github.com)", "WebFetch(domain:raw.githubusercontent.com)", "WebFetch(domain:codeload.github.com)",
    "Edit(~/**)", "Write(~/**)", "Edit(//C:/Users/**)", "Write(//C:/Users/**)",
    "Bash(gh:*)", "Bash(git clone:*)", "Bash(git fetch:*)", "Bash(git pull:*)", "Bash(git remote add:*)",
  ], { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28, env: process.env });
  const wallMs = Date.now() - started;

  const events = run.stdout.split("\n").filter((l) => l.startsWith("{"));
  writeFileSync(join(out, "setup.events.jsonl"), events.map((l) => l + "\n").join(""), { flag: "a" });
  const result = events.map((l) => JSON.parse(l) as { type?: string; result?: string; total_cost_usd?: number; num_turns?: number }).reverse().find((e) => e.type === "result");
  const turns = join(out, "setup.turns.jsonl");
  const turn = existsSync(turns) ? readFileSync(turns, "utf8").split("\n").filter(Boolean).length + 1 : 1;
  writeFileSync(turns, JSON.stringify({ turn, message, wallMs, costUsd: result?.total_cost_usd ?? 0, numTurns: result?.num_turns ?? 0, reply: result?.result ?? "", stderr: result ? "" : run.stderr.slice(-2000) }) + "\n", { flag: "a" });
  console.log("--- turn " + turn + ": " + Math.round(wallMs / 1000) + "s, $" + (result?.total_cost_usd ?? 0).toFixed(2) + " list, " + (result?.num_turns ?? 0) + " agent turns");
  console.log(result?.result ?? "(no result) " + run.stderr.slice(-1000));
}

// After the conversation: the implementation is everything the agent added or changed, except the spec.
function record(repo: string) {
  const out = dirname(resolve(repo));
  const status = git(repo, "status", "--porcelain", "-uall").split("\n").filter(Boolean);
  const paths = (code: RegExp) => status.filter((l) => code.test(l.slice(0, 2))).map((l) => l.slice(3)).filter((p) => !p.startsWith(SPEC_DIR + "/"));
  const impl: Implementation = { added: paths(/\?\?|A/), modified: paths(/M/), patch: git(repo, "diff", "--", ".", ":(exclude)" + SPEC_DIR) };
  writeFileSync(join(out, "implementation.json"), JSON.stringify(impl, null, 2));
  const turns = readFileSync(join(out, "setup.turns.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { costUsd: number; wallMs: number });
  console.log("implementation: added " + impl.added.length + " files, modified " + impl.modified.length + "; setup " + turns.length + " turns, $" + turns.reduce((s, t) => s + t.costUsd, 0).toFixed(2) + " list, " + Math.round(turns.reduce((s, t) => s + t.wallMs, 0) / 1000) + "s");
  for (const f of [...impl.added, ...impl.modified]) console.log("  " + f);
  audit(out);
}

// Leak check: any tool call during setup that could have reached the repository's hosting site.
function audit(out: string) {
  const suspicious: string[] = [];
  for (const line of readFileSync(join(out, "setup.events.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const event = JSON.parse(line) as { type?: string; message?: { content?: Array<{ type?: string; name?: string; input?: unknown }> } };
    for (const block of event.message?.content ?? []) {
      if (block.type !== "tool_use") continue;
      // Only where a call can go: the command, the URL, or the file path, not file contents.
      const args = (block.input ?? {}) as { command?: string; url?: string; file_path?: string };
      const input = [args.command, args.url, args.file_path].filter(Boolean).join(" ");
      if (!input) continue;
      // Heredoc bodies are file contents written through Bash, not where the call goes.
      const reach = input.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\1(?=\s|$)/g, "<<heredoc");
      // Code hosts (future commits) and the user's home directory (their own agent settings).
      const codeHost = /https?:\/\/[^\s"']*(github|gitlab|bitbucket)|\bgit\s+(clone|fetch|pull|remote)\b|(^|[\s;&|(])gh\s/i;
      const home = /~[\\/]\.claude|USERPROFILE|\$HOME|C:[\\/]+Users/i;
      if (codeHost.test(reach) || home.test(reach)) suspicious.push(`${block.name}: ${reach.slice(0, 200)}`);
    }
  }
  console.log(suspicious.length ? `LEAK CHECK: ${suspicious.length} suspicious tool calls\n  ${suspicious.join("\n  ")}` : "leak check: no tool call reached a code host or the home directory");
}

function install(repo: string, caseDir: string) {
  const impl = JSON.parse(readFileSync(join(dirname(resolve(repo)), "implementation.json"), "utf8")) as Implementation;
  const snapshot = join(caseDir, "snapshot");
  for (const p of impl.added) {
    mkdirSync(dirname(join(snapshot, p)), { recursive: true });
    cpSync(join(repo, p), join(snapshot, p));
  }
  // Changes to files that already existed are applied as a patch; the case is at a later commit.
  let patchApplied = true;
  let patchError = "";
  if (impl.patch.trim()) {
    // A copied snapshot has stale index stat data, which --3way reports as "does not match index".
    spawnSync("git", ["-C", snapshot, "update-index", "-q", "--refresh"]);
    const r = spawnSync("git", ["-C", snapshot, "apply", "--3way", "--whitespace=nowarn", "-"], { input: impl.patch, encoding: "utf8" });
    patchApplied = r.status === 0;
    patchError = r.stderr.trim();
  }
  mkdirSync(join(caseDir, "runs"), { recursive: true });
  writeFileSync(join(caseDir, "runs", "installed.json"), JSON.stringify({ from: resolve(repo), added: impl.added.length, modified: impl.modified, patchApplied, patchError }, null, 2));
  console.log(`installed into ${caseDir}: ${impl.added.length} files${impl.modified.length ? `, patch ${patchApplied ? "applied" : `FAILED: ${patchError.slice(0, 120)}`}` : ""}`);
}

if (command === "setup" && rest[0] && rest[1]) setup(rest[0], rest[1]);
else if (command === "record" && rest[0]) record(rest[0]);
else if (command === "install" && rest[0] && rest[1] && existsSync(rest[1])) install(rest[0], rest[1]);
else {
  console.error("usage: node bench/run-e2e.mts setup <setup-repo> <message> [--model sonnet] [--effort medium] | record <setup-repo> | install <setup-repo> <case-dir>");
  process.exit(2);
}
