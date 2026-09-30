// Cascade arm (docs/records/phase0-experiment.md §14): the main model writes the JevGrep questions,
// a script runs the scan before the worker starts, and a small worker model gets the methodology,
// the repository rules and the scan's top hits as unverified leads. The worker is not asked to scan.
//
// The main model only sees the change, the rules and a directory overview (no tools), the way a
// main agent that just made the change would write the questions before handing off.
//
// Usage: node bench/run-cascade.mts <case-dir> <run-name> --rules rules.md [--main sonnet] [--worker haiku]
// Needs TYPESAFE_API_KEY. Writes runs/<run-name>.json (worker result plus main and Jev cost),
// runs/<run-name>.query.json, .prescan.jsonl and .leads.md.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [caseDir, runName] = process.argv.slice(2);
const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const rulesPath = opt("rules");
const mainModel = opt("main") ?? "sonnet";
const workerModel = opt("worker") ?? "haiku";
if (!caseDir || !runName || !rulesPath) {
  console.error("usage: node bench/run-cascade.mts <case-dir> <run-name> --rules rules.md [--main sonnet] [--worker haiku]");
  process.exit(2);
}
if (!process.env["TYPESAFE_API_KEY"]) {
  console.error("the cascade needs TYPESAFE_API_KEY in the environment");
  process.exit(2);
}

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8")) as { description: string; seedPatch: string; seed: { path: string } };
const snapshot = join(caseDir, "snapshot");
const runs = resolve(caseDir, "runs");
const file = (suffix: string) => join(runs, `${runName}${suffix}`);

// Directory overview so the main model can pick scopes: directories up to depth 3 with file counts.
const counts = new Map<string, number>();
for (const f of execFileSync("git", ["-C", snapshot, "-c", "core.quotepath=off", "ls-files"], { maxBuffer: 1 << 28 }).toString().split("\n").filter(Boolean)) {
  const parts = f.split("/").slice(0, -1);
  for (let depth = 1; depth <= Math.min(3, parts.length); depth++) {
    const dir = `${parts.slice(0, depth).join("/")}/`;
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
}
const overview = [...counts].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 400).map(([d, n]) => `${d} (${n})`).join("\n");

// 1. The main model writes the questions.
const mainPrompt = `You just made the change below. A smaller model will now search for every other place that must also change. Before it starts, prepare a pre-scan for it with JevGrep: a fast classifier that reads the repository in windows of about 60 lines and answers one yes/no question per window. It cannot follow references across files.

Change description:
${kase.description}

Diff of the change:
\`\`\`diff
${kase.seedPatch}
\`\`\`

${readFileSync(rulesPath, "utf8")}

## Directories (file counts)

${overview}

Write "context" (one or two sentences on what changed, including the before and after) and up to 6 targets. Each target has:
- "question": does this window contain a place that must be added to or changed because of this change? Make it specific to this change and answerable from the window alone. Ask where something must be added or changed ("Is this the release notes of the version under development?"), not whether the change is already there, and not what topic a file is about.
- "paths": directories or globs where such places can be. Use the rules and the directory list. Aim at places outside the changed file (${kase.seed.path}) that are hard to see from the diff alone: siblings with the same role, other paths that apply the same decision, boundaries, and repository conventions.
- "keywords": identifiers or strings likely to appear in matching windows.
Use ids T1, T2, ...`;

const list = { type: "array", items: { type: "string" } };
const querySchema = {
  type: "object",
  properties: {
    context: { type: "string" },
    targets: { type: "array", items: { type: "object", properties: { id: { type: "string" }, question: { type: "string" }, paths: list, keywords: list }, required: ["id", "question", "paths", "keywords"] } },
  },
  required: ["context", "targets"],
};
const mainStarted = Date.now();
const main = spawnSync("claude", [
  "-p", mainPrompt,
  "--output-format", "json",
  "--json-schema", JSON.stringify(querySchema),
  "--model", mainModel,
  // No tools: the questions come from the change, the rules and the overview.
  "--setting-sources", "project",
  "--strict-mcp-config",
  "--disable-slash-commands",
  "--permission-mode", "dontAsk",
  "--no-session-persistence",
], { cwd: snapshot, encoding: "utf8", maxBuffer: 1 << 26 });
const mainMs = Date.now() - mainStarted;
let mainOut: { structured_output?: { context: string; targets: Array<{ id: string; question: string }> }; total_cost_usd?: number };
try {
  mainOut = JSON.parse(main.stdout);
} catch {
  mainOut = {};
}
if (!mainOut.structured_output) {
  writeFileSync(file(".failed.json"), JSON.stringify({ stage: "main", stdout: main.stdout, stderr: main.stderr }, null, 2));
  console.log(`FAILED ${file(".failed.json")} (main model wrote no query)`);
  process.exit(1);
}
const query = mainOut.structured_output;
writeFileSync(file(".query.json"), JSON.stringify(query, null, 2));

// 2. The scan runs before the worker starts.
const prescan = file(".prescan.jsonl");
rmSync(prescan, { force: true });
const scan = spawnSync(process.execPath, [here("./jevgrep.mts"), "scan", "-"], {
  cwd: snapshot,
  input: JSON.stringify(query),
  encoding: "utf8",
  maxBuffer: 1 << 26,
  env: { ...process.env, JEVGREP_LOG: prescan },
});
if (!existsSync(prescan)) {
  writeFileSync(file(".failed.json"), JSON.stringify({ stage: "scan", stdout: scan.stdout, stderr: scan.stderr }, null, 2));
  console.log(`FAILED ${file(".failed.json")} (scan did not run)`);
  process.exit(1);
}
type Hit = { path: string; start: number; end: number; score: number };
const logged = JSON.parse(readFileSync(prescan, "utf8").trim().split("\n")[0]!) as { summary: { windows: number; jevCostUsd: number; elapsedS: number }; top: Record<string, Hit[]> };

// 3. Leads: the best window of the top 3 files per target, never the changed file itself.
const sections = query.targets.map((t) => {
  const seen = new Set<string>();
  const hits = (logged.top[t.id] ?? []).filter((h) => h.path !== kase.seed.path && !seen.has(h.path) && seen.add(h.path)).slice(0, 3);
  return [`### ${t.id}: ${t.question}`, ...(hits.length ? hits.map((h) => `- ${h.path}:${h.start}-${h.end} (score ${h.score.toFixed(2)})`) : ["- (no likely match)"])].join("\n");
});
const leadsPath = file(".leads.md");
writeFileSync(leadsPath, readFileSync(here("./prompts/leads.md"), "utf8").replace("{{LEADS}}", sections.join("\n\n")));

// 4. The worker.
const worker = spawnSync(process.execPath, [here("./run-agent.mts"), caseDir, "S-leads", runName, "--model", workerModel, "--rules", rulesPath, "--leads", leadsPath], {
  encoding: "utf8",
  maxBuffer: 1 << 26,
});
const out = [file(".json"), file(".failed.json")].find((p) => existsSync(p) && JSON.parse(readFileSync(p, "utf8")).arm === "S-leads");
if (!out) {
  console.log(`FAILED worker did not write a result: ${worker.stderr.slice(0, 200)}`);
  process.exit(1);
}

// 5. The cascade's cost and time include the main model and the scan.
const run = JSON.parse(readFileSync(out, "utf8"));
run.main = { model: mainModel, costUsd: mainOut.total_cost_usd ?? 0, wallMs: mainMs };
run.jev = { scans: 1, windows: logged.summary.windows, costUsd: logged.summary.jevCostUsd, elapsedS: logged.summary.elapsedS };
run.totalWallMs = mainMs + logged.summary.elapsedS * 1000 + run.wallMs;
writeFileSync(out, JSON.stringify(run, null, 2));
console.log(`${out.endsWith(".failed.json") ? "FAILED" : "wrote"} ${out} (main $${run.main.costUsd.toFixed(2)}, jev $${run.jev.costUsd.toFixed(3)}, ${Math.round(run.totalWallMs / 1000)}s total)`);
