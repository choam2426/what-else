// Compares two arms of the DeepSWE experiment task by task (docs/records/baseline-deepswe.md): pass,
// the share of new-feature tests passed (f2p), the share of all graded tests passed (partial) and
// cost. Each arm is a JSON file written by `bench/deepswe-collect.mts --json`. Only tasks graded in
// both arms are compared; when an arm has several trials of a task, its means are used.
//
// Usage: node bench/deepswe-compare.mts <baseline.json> <arm.json> [--labels base,arm]

import { readFileSync } from "node:fs";

type Trial = { task: string; reward: number | null; f2p: number | null; partial?: number | null; p2p: number | null; costUsd: number | null; exception?: string };

const [baseFile, armFile] = process.argv.slice(2);
if (!baseFile || !armFile) {
  console.error("usage: node bench/deepswe-compare.mts <baseline.json> <arm.json> [--labels base,arm]");
  process.exit(2);
}
const labelArg = process.argv.includes("--labels") ? process.argv[process.argv.indexOf("--labels") + 1]! : "baseline,arm";
const [baseLabel, armLabel] = labelArg.split(",");

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
type Row = { pass: number; f2p: number; partial: number; cost: number };
function byTask(file: string) {
  const groups = new Map<string, Trial[]>();
  for (const t of JSON.parse(readFileSync(file, "utf8")) as Trial[]) {
    if (t.exception || t.reward === null) continue;
    groups.set(t.task, [...(groups.get(t.task) ?? []), t]);
  }
  const rows = new Map<string, Row>();
  for (const [task, ts] of groups) {
    rows.set(task, {
      pass: mean(ts.map((t) => (t.reward === 1 ? 1 : 0))),
      f2p: mean(ts.map((t) => t.f2p ?? 0)),
      // partial is not in older collect output; f2p and p2p weighted equally stand in for it.
      partial: mean(ts.map((t) => t.partial ?? ((t.f2p ?? 0) + (t.p2p ?? 0)) / 2)),
      cost: mean(ts.map((t) => t.costUsd ?? 0)),
    });
  }
  return rows;
}

const base = byTask(baseFile);
const arm = byTask(armFile);
const tasks = [...base.keys()].filter((t) => arm.has(t)).sort();
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`task | ${baseLabel} pass f2p | ${armLabel} pass f2p | f2p change`);
for (const t of tasks) {
  const b = base.get(t)!;
  const a = arm.get(t)!;
  const flip = a.pass > b.pass ? "  FIXED" : a.pass < b.pass ? "  BROKE" : "";
  console.log(`${t} | ${b.pass} ${pct(b.f2p)} | ${a.pass} ${pct(a.f2p)} | ${((a.f2p - b.f2p) * 100).toFixed(1)}pt${flip}`);
}

// Paired bootstrap over tasks for the mean difference in f2p, so the interval reflects which tasks were drawn.
function bootstrap(diff: number[], rounds = 10000) {
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const means: number[] = [];
  for (let r = 0; r < rounds; r++) {
    let s = 0;
    for (let i = 0; i < diff.length; i++) s += diff[Math.floor(rand() * diff.length)]!;
    means.push(s / diff.length);
  }
  means.sort((x, y) => x - y);
  return [means[Math.floor(rounds * 0.025)]!, means[Math.floor(rounds * 0.975)]!] as const;
}

const sum = (rows: Row[], k: keyof Row) => rows.reduce((s, r) => s + r[k], 0);
const B = tasks.map((t) => base.get(t)!);
const A = tasks.map((t) => arm.get(t)!);
const f2pDiff = tasks.map((_, i) => A[i]!.f2p - B[i]!.f2p);
const [lo, hi] = bootstrap(f2pDiff);
console.log(`\n${tasks.length} tasks graded in both arms`);
console.log(`pass:    ${baseLabel} ${sum(B, "pass")}/${tasks.length} (${pct(sum(B, "pass") / tasks.length)})  ${armLabel} ${sum(A, "pass")}/${tasks.length} (${pct(sum(A, "pass") / tasks.length)})`);
console.log(`         fixed ${tasks.filter((_, i) => A[i]!.pass > B[i]!.pass).length}, broke ${tasks.filter((_, i) => A[i]!.pass < B[i]!.pass).length}`);
console.log(`f2p:     ${baseLabel} ${pct(mean(B.map((r) => r.f2p)))}  ${armLabel} ${pct(mean(A.map((r) => r.f2p)))}  change ${(mean(f2pDiff) * 100).toFixed(1)}pt (95% CI ${(lo * 100).toFixed(1)} to ${(hi * 100).toFixed(1)})`);
console.log(`partial: ${baseLabel} ${pct(mean(B.map((r) => r.partial)))}  ${armLabel} ${pct(mean(A.map((r) => r.partial)))}`);
console.log(`cost:    ${baseLabel} $${mean(B.map((r) => r.cost)).toFixed(2)}  ${armLabel} $${mean(A.map((r) => r.cost)).toFixed(2)} per task`);
