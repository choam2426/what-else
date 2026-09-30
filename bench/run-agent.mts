// Runs one Phase 0 arm with a harness in non-interactive mode (docs/records/phase0-experiment.md §5).
//
// Usage: node bench/run-agent.mts <case-dir> <arm: A|A2|S-nojev|S> <run-name> [--model sonnet] [--rules rules.md]
// Writes <case-dir>/runs/<run-name>.json with the harness's raw result (usage, cost, duration, locations).
// A is the vanilla harness. A2 is arm A' in the docs: the same prompt plus the methodology
// (bench/prompts/methodology.md), no Jev. S-nojev adds the repository rules written by
// bench/setup.mts (--rules). S also gets JevGrep (bench/prompts/jevgrep.md, bench/jevgrep.mts); its
// scans are logged to runs/<run-name>.jev.jsonl and their Jev cost is added to the run file.
// Arm S needs TYPESAFE_API_KEY in the environment. S-leads is the cascade worker: the S-nojev
// prompt plus leads from a scan that ran before it started (--leads, written by run-cascade.mts);
// the worker has no JevGrep and is not asked to scan.
//
// M and M-nojev follow the real workflow in one session: the main model (--model) gets the task
// plus bench/prompts/delegate.md and hands the search to a `change-scope-worker` subagent
// (--worker, default haiku) that holds the methodology and the rules (bench/prompts/worker.md).
// In M the brief also carries JevGrep questions and the worker runs them; M-nojev has no Jev.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [caseDir, arm, runName] = process.argv.slice(2);
const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const model = opt("model") ?? "sonnet";
const rulesPath = opt("rules");
const leadsPath = opt("leads");
const workerModel = opt("worker") ?? "haiku";
// E is the end-to-end arm: the plain A task in a snapshot where run-e2e.mts installed an
// implementation built from the spec. Skills stay enabled so the implementation's entry point can
// be used, and every event is kept (runs/<run-name>.events.jsonl) for the spec's behavioral checks.
const ARMS = ["A", "A2", "S-nojev", "S", "S-leads", "M", "M-nojev", "E"];
const e2e = arm === "E";
const delegated = arm === "M" || arm === "M-nojev";
const withJev = arm === "S" || arm === "M";
const withRules = arm === "S-nojev" || arm === "S" || arm === "S-leads" || delegated;
if (!caseDir || !runName || !ARMS.includes(arm ?? "") || withRules !== (rulesPath !== undefined) || (arm === "S-leads") !== (leadsPath !== undefined)) {
  console.error("usage: node bench/run-agent.mts <case-dir> <A|A2|S-nojev|S|S-leads|M|M-nojev> <run-name> [--model sonnet] [--worker haiku] [--rules rules.md (S and M arms)] [--leads leads.md (S-leads)]");
  process.exit(2);
}
if ((withJev || e2e) && !process.env["TYPESAFE_API_KEY"]) {
  console.error(`arm ${arm} needs TYPESAFE_API_KEY in the environment`);
  process.exit(2);
}
// In the delegated arms the methodology belongs to the worker, not the main prompt.
const withMethodology = arm !== "A" && !e2e && !delegated;

const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8")) as { description: string; seedPatch: string };

// Every arm shares this text word for word; the other arms only append to it.
const basePrompt = `The following change was just made to this repository.

Change description:
${kase.description}

Diff of the change:
\`\`\`diff
${kase.seedPatch}
\`\`\`

Find every other location in this codebase that must also change for this change to be complete and consistent: code, tests, documentation, configuration, or anything else.
Be exhaustive. Do not modify any files.
Report each location as a path relative to the repository root, with the line range in the current version of the file, and a short reason.`;

const methodology = readFileSync(fileURLToPath(new URL("./prompts/methodology.md", import.meta.url)), "utf8");
const rules = rulesPath ? readFileSync(rulesPath, "utf8") : "";
const promptFile = (name: string) => readFileSync(fileURLToPath(new URL(`./prompts/${name}`, import.meta.url)), "utf8");
const jevgrepCli = fileURLToPath(new URL("./jevgrep.mts", import.meta.url)).replaceAll("\\", "/");
const jevgrep = withJev ? promptFile("jevgrep.md").replaceAll("{{JEVGREP}}", jevgrepCli) : "";
const leads = leadsPath ? readFileSync(leadsPath, "utf8") : "";

// Delegated arms: the main prompt says how to hand off; the worker's definition holds the method.
const BRIEF_JEV = "   - questions for JevGrep, the worker's fast classifier: one per kind of place to find, each answerable from a window of about 60 lines alone. Describe the kind of place and what must be added or changed there, for example \"the release notes of the version under development, where a note about the dropped support belongs\". Give the directories or globs to scan and a few keywords. The worker runs them as given.";
const delegate = delegated ? promptFile("delegate.md").replace("{{BRIEF_EXTRA}}\n", arm === "M" ? `${BRIEF_JEV}\n` : "") : "";
const workerPrompt = promptFile("worker.md")
  .replace("{{METHODOLOGY}}", methodology)
  .replace("{{RULES}}", rules)
  .replace("{{JEVGREP}}\n", arm === "M" ? `${jevgrep}\nIf the brief contains JevGrep questions, run them first, as given, in one scan.\n` : "");

// The main model gets the rules too (a skill would load them into its context), so it can
// point the worker at the right places without reading the repository.
const prompt = delegated
  ? [basePrompt, rules, delegate].join("\n\n")
  : [basePrompt, ...(withMethodology ? [methodology] : []), ...(rules ? [rules] : []), ...(jevgrep ? [jevgrep] : []), ...(leads ? [leads] : [])].join("\n\n");

const locationFields = {
  path: { type: "string" },
  start_line: { type: "integer" },
  end_line: { type: "integer" },
  reason: { type: "string" },
};
// A keeps its original schema so earlier A runs stay comparable. Methodology arms add the fields the
// methodology asks for; they are optional so scoring treats both arms the same way.
const methodologyFields = {
  necessity: { type: "string", enum: ["required", "optional"] },
  axis: { type: "string" },
};
const schema = {
  type: "object",
  properties: {
    ...(withMethodology ? { coverage: { type: "array", items: { type: "object", properties: { axis: { type: "string" }, searched: { type: "string" }, found: { type: "string" } }, required: ["axis", "searched", "found"] } } } : {}),
    locations: {
      type: "array",
      items: {
        type: "object",
        properties: withMethodology ? { ...locationFields, ...methodologyFields } : locationFields,
        required: ["path", "reason"],
      },
    },
  },
  required: ["locations"],
};

const args = [
  "-p", prompt,
  ...(e2e ? ["--output-format", "stream-json", "--verbose"] : ["--output-format", "json"]),
  "--json-schema", JSON.stringify(schema),
  "--model", model,
  // Same environment for every arm: no user settings or MCP servers. Only E keeps skills
  // enabled; the other snapshots have no project skills, so this changes nothing for them.
  "--setting-sources", "project",
  "--strict-mcp-config",
  ...(e2e ? [] : ["--disable-slash-commands"]),
  "--permission-mode", "dontAsk",
  "--allowedTools", "Read", "Grep", "Glob", "Bash", "Agent", ...(e2e ? ["Skill"] : []),
  // No edits, and no looking up the real commit online.
  "--disallowedTools", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch",
  "--no-session-persistence",
];

mkdirSync(join(caseDir, "runs"), { recursive: true });
const jevLog = resolve(caseDir, "runs", `${runName}.jev.jsonl`);
rmSync(jevLog, { force: true });

// The worker's definition goes in a file: with the method and the rules inside, it would push the
// command line past Windows' length limit.
if (delegated) {
  const agentsFile = resolve(caseDir, "runs", `${runName}.agents.json`);
  writeFileSync(agentsFile, JSON.stringify({
    "change-scope-worker": {
      description: "Finds every place in the repository that must also change for a change that was just made. Give it a brief: what changed, places already known, where to look.",
      prompt: workerPrompt,
      model: workerModel,
      tools: ["Read", "Grep", "Glob", "Bash"],
    },
  }, null, 2));
  args.push("--agents", agentsFile);
}
// --dry-run writes the prompt next to the run files and stops, for reviewing an arm before running it.
if (process.argv.includes("--dry-run")) {
  writeFileSync(resolve(caseDir, "runs", `${runName}.prompt.md`), prompt);
  console.log(`dry run: wrote ${resolve(caseDir, "runs", `${runName}.prompt.md`)}${delegated ? " and the worker definition" : ""}`);
  process.exit(0);
}

const started = Date.now();
const result = spawnSync("claude", args, {
  cwd: join(caseDir, "snapshot"),
  encoding: "utf8",
  maxBuffer: 1 << 28,
  env: { ...process.env, JEVGREP_LOG: jevLog },
});
const wallMs = Date.now() - started;

// Jev usage from the agent's scans, so cost comparisons include it.
type ScanSummary = { windows: number; jevCostUsd: number; elapsedS: number };
const scans = existsSync(jevLog)
  ? readFileSync(jevLog, "utf8").trim().split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { summary: ScanSummary }).summary)
  : [];
const jev = {
  scans: scans.length,
  windows: scans.reduce((s, x) => s + x.windows, 0),
  costUsd: scans.reduce((s, x) => s + x.jevCostUsd, 0),
  elapsedS: scans.reduce((s, x) => s + x.elapsedS, 0),
};
let parsed: { is_error?: boolean; parseError?: boolean; result?: string } & Record<string, unknown>;
try {
  if (e2e) {
    // stream-json: one event per line, the last "result" event carries what --output-format json would.
    writeFileSync(resolve(caseDir, "runs", `${runName}.events.jsonl`), result.stdout);
    const events = result.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as { type?: string });
    const last = events.reverse().find((e) => e.type === "result");
    if (!last) throw new Error("no result event");
    parsed = last as typeof parsed;
  } else {
    parsed = JSON.parse(result.stdout);
  }
} catch {
  parsed = { parseError: true, stdout: result.stdout.slice(-4000), stderr: result.stderr, status: result.status };
}
// A failed run (usage limit, crash, or finishing without the structured answer, which small
// models sometimes do) is kept aside so "no <run-name>.json" always means "run it". Failure
// counts are part of the result: look for *.failed.json.
const failed = parsed.is_error === true || parsed.parseError === true || parsed["structured_output"] === undefined;
const out = join(caseDir, "runs", failed ? `${runName}.failed.json` : `${runName}.json`);
writeFileSync(out, JSON.stringify({ arm, model, ...(delegated ? { worker: workerModel } : {}), wallMs, ...(withJev ? { jev } : {}), result: parsed }, null, 2));
console.log(`${failed ? "FAILED" : "wrote"} ${out} (exit ${result.status}, ${Math.round(wallMs / 1000)}s)${failed ? ` ${String(parsed.result ?? parsed["stderr"] ?? "").slice(0, 100)}` : ""}`);
if (failed) process.exitCode = 1;
