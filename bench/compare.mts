// Compares arms case by case (docs/records/phase0-experiment.md §7): non-test files found,
// the labeled files arm A missed, extra files, and cost including Jev.
//
// Usage: node bench/compare.mts <bench-dir> --runs A-sonnet-1,A2-sonnet-1,... [--labels labels.json]
// labels.json: { "<case-dir>": ["path that had to change and A missed", ...] }

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [benchDir] = process.argv.slice(2);
const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const runs = opt("runs")?.split(",") ?? [];
if (!benchDir || runs.length === 0) {
  console.error("usage: node bench/compare.mts <bench-dir> --runs A-sonnet-1,A2-sonnet-1 [--labels labels.json]");
  process.exit(2);
}
const labelsPath = opt("labels");
const labels = (labelsPath ? JSON.parse(readFileSync(labelsPath, "utf8")) : {}) as Record<string, string[]>;

type Truth = { path: string; kind: string };
type Total = { runs: number; found: number; of: number; labeled: number; labeledOf: number; extra: number; cost: number; seconds: number; turns: number };
const totals = new Map<string, Total>(runs.map((r) => [r, { runs: 0, found: 0, of: 0, labeled: 0, labeledOf: 0, extra: 0, cost: 0, seconds: 0, turns: 0 }]));

const header = ["case", ...runs];
const table: string[][] = [];
for (const dir of readdirSync(benchDir).filter((d) => existsSync(join(benchDir, d, "case.json"))).sort()) {
  const truth = (JSON.parse(readFileSync(join(benchDir, dir, "case.json"), "utf8")) as { truth: Truth[] }).truth;
  const nonTest = truth.filter((t) => t.kind !== "test");
  const labeled = labels[dir] ?? [];
  const row = [dir];
  for (const name of runs) {
    const file = join(benchDir, dir, "runs", `${name}.json`);
    if (!existsSync(file)) {
      row.push("-");
      continue;
    }
    const run = JSON.parse(readFileSync(file, "utf8"));
    const r = run.result;
    const paths = new Set(((r.structured_output?.locations ?? []) as Array<{ path: string }>).map((l) => l.path.replace(/^\.?\//, "")));
    const found = nonTest.filter((t) => paths.has(t.path)).length;
    const labeledFound = labeled.filter((p) => paths.has(p)).length;
    const cost = (r.total_cost_usd ?? 0) + (run.jev?.costUsd ?? 0) + (run.main?.costUsd ?? 0);
    const t = totals.get(name)!;
    t.runs++;
    t.found += found;
    t.of += nonTest.length;
    t.labeled += labeledFound;
    t.labeledOf += labeled.length;
    t.extra += [...paths].filter((p) => !truth.some((x) => x.path === p)).length;
    t.cost += cost;
    t.seconds += (run.totalWallMs ?? run.wallMs ?? 0) / 1000;
    t.turns += r.num_turns ?? 0;
    row.push(`${found}/${nonTest.length}${labeled.length ? ` (A-miss ${labeledFound}/${labeled.length})` : ""} $${cost.toFixed(2)}`);
  }
  table.push(row);
}

console.log(`| ${header.join(" | ")} |`);
console.log(`| ${header.map(() => "---").join(" | ")} |`);
for (const row of table) console.log(`| ${row.join(" | ")} |`);
console.log("");
for (const [name, t] of totals) {
  const n = Math.max(1, t.runs);
  console.log(
    `${name}: ${t.runs} runs · non-test ${t.found}/${t.of} · A-missed files found ${t.labeled}/${t.labeledOf} · extra ${t.extra} · ` +
      `$${t.cost.toFixed(2)} (avg $${(t.cost / n).toFixed(2)}) · avg ${Math.round(t.seconds / n)}s · avg ${Math.round(t.turns / n)} turns`,
  );
}
