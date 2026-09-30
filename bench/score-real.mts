// Scores the realistic benchmark (docs/records/e2e-benchmark.md §11): for each case, which of the
// files the commit had to change the agent's final diff covered, paired across arms.
//
// Usage: node bench/score-real.mts <real-cases-dir> --runs A:RA-sonnet-1,E:RE-sonnet-1 --labels a.json,b.json [--blind]
//   <real-cases-dir> holds one directory per arm (A/, E/), each with the same case names.
//   Required files are the "required" labels plus the seed file. --blind hides the missed paths.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [root] = process.argv.slice(2);
const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const arms = (opt("runs") ?? "").split(",").filter(Boolean).map((s) => s.split(":") as [string, string]);
const labels = (opt("labels") ?? "").split(",").filter(Boolean).reduce((all, f) => ({ ...all, ...JSON.parse(readFileSync(f, "utf8")) }), {} as Record<string, Record<string, { label: string }>>);
const blind = process.argv.includes("--blind");
if (!root || arms.length === 0) {
  console.error("usage: node bench/score-real.mts <real-cases-dir> --runs A:RA-sonnet-1,E:RE-sonnet-1 --labels a.json [--blind]");
  process.exit(2);
}

// Jev cost from the implementation's own JevGrep run records. Implementations name the fields as
// they like, so input tokens are looked for under a few names; with only a request count, a
// request is taken as 1,200 input tokens (about one 100-line piece plus the questions).
const JEV_USD_PER_TOKEN = 0.042 / 1e6;
function jevCost(logsPath: string): number {
  if (!existsSync(logsPath)) return 0;
  let tokens = 0;
  for (const text of Object.values(JSON.parse(readFileSync(logsPath, "utf8")) as Record<string, string>)) {
    for (const line of text.split("\n").filter(Boolean)) {
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const stats = { ...entry, ...((entry["stats"] ?? entry["usage"] ?? {}) as Record<string, unknown>) };
      const inputTokens = Number(stats["input_tokens"] ?? stats["inputTokens"] ?? 0);
      const requests = Number(stats["requests"] ?? stats["new_requests"] ?? stats["n_requests"] ?? 0);
      tokens += inputTokens || requests * 1200;
    }
  }
  return tokens * JEV_USD_PER_TOKEN;
}

type Total = { runs: number; covered: number; required: number; complete: number; extra: number; cost: number; seconds: number };
const totals = new Map(arms.map(([arm]) => [arm, { runs: 0, covered: 0, required: 0, complete: 0, extra: 0, cost: 0, seconds: 0 } as Total]));
const cases = readdirSync(join(root, arms[0]![0])).filter((d) => existsSync(join(root, arms[0]![0], d, "case.json"))).sort();
// Only cases every arm has a result for, so the comparison stays paired.
const paired = cases.filter((c) => arms.every(([arm, run]) => existsSync(join(root, arm, c, "runs", `${run}.json`))));

for (const name of paired) {
  const kase = JSON.parse(readFileSync(join(root, arms[0]![0], name, "case.json"), "utf8")) as { seed: { path: string }; truth: Array<{ path: string }> };
  const caseLabels = labels[name];
  if (!caseLabels) continue;
  const required = [...new Set([...Object.entries(caseLabels).filter(([, v]) => v.label === "required").map(([p]) => p), kase.seed.path])];
  const truth = new Set(kase.truth.map((t) => t.path));
  const row = [name.padEnd(20), `req ${String(required.length).padStart(2)}`];
  for (const [arm, run] of arms) {
    const r = JSON.parse(readFileSync(join(root, arm, name, "runs", `${run}.json`), "utf8")) as { wallMs: number; changed: Array<{ path: string }>; result: { total_cost_usd?: number } };
    r.result.total_cost_usd = (r.result.total_cost_usd ?? 0) + jevCost(join(root, arm, name, "runs", `${run}.claude-logs.json`));
    const changed = new Set(r.changed.map((c) => c.path));
    const missed = required.filter((p) => !changed.has(p));
    const t = totals.get(arm)!;
    t.runs++;
    t.required += required.length;
    t.covered += required.length - missed.length;
    if (missed.length === 0) t.complete++;
    t.extra += [...changed].filter((p) => !truth.has(p)).length;
    t.cost += r.result.total_cost_usd ?? 0;
    t.seconds += r.wallMs / 1000;
    row.push(`${arm} ${required.length - missed.length}/${required.length} $${(r.result.total_cost_usd ?? 0).toFixed(2)} ${Math.round(r.wallMs / 1000)}s${missed.length && !blind ? ` missed ${missed.join(" ")}` : ""}`);
  }
  console.log(row.join(" | "));
}
console.log("");
for (const [arm, t] of totals) {
  const n = Math.max(1, t.runs);
  console.log(`${arm}: ${t.runs} cases · required covered ${t.covered}/${t.required} (${Math.round((100 * t.covered) / Math.max(1, t.required))}%) · complete cases ${t.complete}/${t.runs} · files outside truth ${t.extra} · $${t.cost.toFixed(2)} (avg $${(t.cost / n).toFixed(2)}) · avg ${Math.round(t.seconds / n)}s`);
}
