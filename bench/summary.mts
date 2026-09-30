// One table over many cases: what each agent run found and missed, file level.
// Test files are reported separately: most test changes in a commit are new tests,
// not places that had to change (phase0-experiment.md §4).
//
// --blind prints counts only, never which files were missed. Use it on the holdout set so
// miss details do not leak into the methodology before it is frozen.
//
// Usage: node bench/summary.mts <bench-dir> [--run A-sonnet-1] [--blind]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [benchDir] = process.argv.slice(2);
const runFlag = process.argv.indexOf("--run");
const runName = runFlag > 0 ? process.argv[runFlag + 1]! : "A-sonnet-1";
const blind = process.argv.includes("--blind");
if (!benchDir) {
  console.error("usage: node bench/summary.mts <bench-dir> [--run A-sonnet-1]");
  process.exit(2);
}

type Truth = { path: string; kind: string };
const rows: string[] = [];
let totals = { nonTest: 0, foundNonTest: 0, test: 0, foundTest: 0, wrong: 0, cost: 0, seconds: 0, runs: 0, casesWithMiss: 0 };

for (const dir of readdirSync(benchDir).filter((d) => existsSync(join(benchDir, d, "case.json"))).sort()) {
  const runPath = join(benchDir, dir, "runs", `${runName}.json`);
  if (!existsSync(runPath)) continue;
  const kase = JSON.parse(readFileSync(join(benchDir, dir, "case.json"), "utf8")) as { description: string; truth: Truth[] };
  const run = JSON.parse(readFileSync(runPath, "utf8"));
  const r = run.result;
  if (r.parseError || r.is_error) {
    rows.push(`${dir.padEnd(18)} ERROR ${String(r.stderr ?? r.result ?? "").slice(0, 80)}`);
    continue;
  }
  const locations = (r.structured_output?.locations ?? []) as Array<{ path: string }>;
  const paths = new Set(locations.map((l) => l.path.replace(/^\.?\//, "")));
  const nonTest = kase.truth.filter((t) => t.kind !== "test");
  const tests = kase.truth.filter((t) => t.kind === "test");
  const missed = nonTest.filter((t) => !paths.has(t.path));
  const truthPaths = new Set(kase.truth.map((t) => t.path));
  const wrong = [...paths].filter((p) => !truthPaths.has(p)).length;

  totals.nonTest += nonTest.length;
  totals.foundNonTest += nonTest.length - missed.length;
  totals.test += tests.length;
  totals.foundTest += tests.filter((t) => paths.has(t.path)).length;
  totals.wrong += wrong;
  totals.cost += (r.total_cost_usd ?? 0) + (run.jev?.costUsd ?? 0) + (run.main?.costUsd ?? 0);
  totals.seconds += (run.totalWallMs ?? run.wallMs ?? r.duration_ms ?? 0) / 1000;
  totals.runs++;
  if (missed.length > 0) totals.casesWithMiss++;

  rows.push(
    `${dir.padEnd(18)} non-test ${nonTest.length - missed.length}/${nonTest.length}  test ${tests.length - tests.filter((t) => !paths.has(t.path)).length}/${tests.length}  ` +
      `extra ${String(wrong).padStart(2)}  $${((r.total_cost_usd ?? 0) + (run.jev?.costUsd ?? 0) + (run.main?.costUsd ?? 0)).toFixed(2)}${run.jev ? ` (jev ${run.jev.scans}×)` : ""}  ${Math.round((run.totalWallMs ?? run.wallMs ?? r.duration_ms ?? 0) / 1000)}s  ${r.num_turns}t  sub ${r.subagent_stats?.spawned ?? 0}` +
      (missed.length && !blind ? `\n${" ".repeat(20)}missed: ${missed.map((m) => `[${m.kind}] ${m.path}`).join(", ")}` : ""),
  );
}

console.log(rows.join("\n"));
console.log(
  `\n${totals.runs} runs · non-test recall ${totals.foundNonTest}/${totals.nonTest} · test ${totals.foundTest}/${totals.test} · ` +
    `cases with a non-test miss ${totals.casesWithMiss}/${totals.runs} · extra files ${totals.wrong} · ` +
    `$${totals.cost.toFixed(2)} list · avg ${Math.round(totals.seconds / Math.max(1, totals.runs))}s`,
);
