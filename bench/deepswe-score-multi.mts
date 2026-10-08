// Scores the blind same-judge scope-miss packs saved under bench/results/deepswe-scope
// (docs/records/baseline-deepswe.md): for each pack, the scope misses per arm (mean of the two judges,
// out of the number of tasks), the judges' agreement, and the per-task table.
//
// Usage: node bench/deepswe-score-multi.mts [results-dir] [pack...]
//   results-dir defaults to bench/results/deepswe-scope; with no packs named, every scored pack is printed.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [dirArg, ...only] = process.argv.slice(2);
const dir = dirArg ?? join(here, "results", "deepswe-scope");
const meta = JSON.parse(readFileSync(join(dir, "packs.json"), "utf8")) as {
  arms: Record<string, string>;
  packs: Record<string, { record: string; round: number; kind?: string; extra?: string }>;
};

type Verdicts = Record<string, Record<string, number>>;
const read = (pack: string, file: string): Verdicts => JSON.parse(readFileSync(join(dir, pack, file), "utf8"));
const both = (pack: string, prefix = "") => ({
  x: { ...read(pack, `${prefix}half1-X.json`), ...read(pack, `${prefix}half2-X.json`) },
  y: { ...read(pack, `${prefix}half1-Y.json`), ...read(pack, `${prefix}half2-Y.json`) },
});

for (const [pack, info] of Object.entries(meta.packs)) {
  if (info.kind === "focus" || (only.length && !only.includes(pack))) continue;
  const key = JSON.parse(readFileSync(join(dir, pack, "key.json"), "utf8")) as Record<string, Record<string, string>>;
  const arm = (run: string) => run.split("/").pop()!;
  const { x, y } = both(pack);
  const extraPrefix = ["over-", "un-"].find((p) => existsSync(join(dir, pack, `${p}half1-X.json`)));
  const extra = extraPrefix ? both(pack, extraPrefix) : undefined;
  const misses: Record<string, number> = {};
  const beyond: Record<string, number> = {};
  const rows: string[] = [];
  let agree = 0;
  let total = 0;
  for (const [task, labels] of Object.entries(key)) {
    const cells: string[] = [];
    for (const [label, run] of Object.entries(labels)) {
      const a = arm(run);
      const mean = (x[task]![label]! + y[task]![label]!) / 2;
      misses[a] = (misses[a] ?? 0) + mean;
      if (extra) beyond[a] = (beyond[a] ?? 0) + (extra.x[task]![label]! + extra.y[task]![label]!) / 2;
      agree += x[task]![label] === y[task]![label] ? 1 : 0;
      total++;
      cells.push(`${a}:${mean}`);
    }
    rows.push(`  ${task.padEnd(44)} ${cells.sort().join(" ")}`);
  }
  const tasks = Object.keys(key).length;
  console.log(`\n${pack} (${info.record}, round ${info.round}): scope misses of ${tasks}, judges agree ${agree}/${total}`);
  for (const [a, m] of Object.entries(misses).sort((p, q) => p[1] - q[1])) {
    const b = extra ? `   beyond request: ${beyond[a]}` : "";
    console.log(`  ${String(m).padStart(4)}  ${meta.arms[a] ?? a}${b}`);
  }
  if (extra) console.log(`  (beyond request: ${info.extra})`);
  console.log(rows.join("\n"));
}
