// Scores candidate locations against a case's ground truth (docs/records/phase0-experiment.md §6).
//
// Usage: node bench/score.mts <case-dir> <run.json> [<run.json> ...]
// A run is either an agent run (from run-agent.mts) or a scan (from scan.mts); for scans the
// candidates are the union of every target's top k.

import { readFileSync } from "node:fs";
import { join } from "node:path";

type Range = { start: number; end: number };
type Truth = { path: string; status: string; kind: "code" | "doc" | "test"; hunks: Range[] };
type Case = { seed: { path: string; oldStart: number; oldLines: number }; truth: Truth[] };
type Candidate = { path: string; start?: number; end?: number };

const [caseDir, ...runPaths] = process.argv.slice(2);
if (!caseDir || runPaths.length === 0) {
  console.error("usage: node bench/score.mts <case-dir> <run.json> [<run.json> ...]");
  process.exit(2);
}
const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8")) as Case & { seedPatch: string };

// Candidates report lines in the snapshot, truth is in parent lines. Only the seed file shifts.
const seedShift = (() => {
  let added = 0;
  let removed = 0;
  for (const l of kase.seedPatch.split("\n")) {
    if (l.startsWith("+") && !l.startsWith("+++")) added++;
    else if (l.startsWith("-") && !l.startsWith("---")) removed++;
  }
  return added - removed;
})();
const toParentLine = (path: string, line: number) =>
  path === kase.seed.path && line >= kase.seed.oldStart ? line - seedShift : line;

const TOLERANCE = 3;
const overlaps = (c: Candidate, h: Range) => {
  if (c.start === undefined) return false;
  const s = toParentLine(c.path, c.start);
  const e = toParentLine(c.path, c.end ?? c.start);
  return s <= h.end + TOLERANCE && e >= h.start - TOLERANCE;
};

function candidatesOf(run: any): { label: string; candidates: Candidate[]; stats: Record<string, unknown> } {
  if (run.summary && run.top) {
    const seen = new Map<string, Candidate>();
    for (const list of Object.values(run.top) as Candidate[][]) for (const u of list) seen.set(`${u.path}:${u.start}`, u);
    return { label: `scan (top ${run.summary.k} per target)`, candidates: [...seen.values()], stats: run.summary };
  }
  const r = run.result;
  const locations = (r.structured_output?.locations ?? JSON.parse(r.result ?? "{}").locations ?? []) as Array<{ path: string; start_line?: number; end_line?: number }>;
  return {
    label: `agent ${run.arm} (${run.model})`,
    candidates: locations.map((l) => ({ path: l.path.replace(/^\.?\//, ""), ...(l.start_line ? { start: l.start_line } : {}), ...(l.end_line ? { end: l.end_line } : {}) })),
    stats: {
      costUsd: r.total_cost_usd,
      durationS: Math.round((r.duration_ms ?? run.wallMs) / 1000),
      turns: r.num_turns,
      inputTokens: r.usage?.input_tokens,
      cacheRead: r.usage?.cache_read_input_tokens,
      cacheCreate: r.usage?.cache_creation_input_tokens,
      outputTokens: r.usage?.output_tokens,
      peakContext: Math.max(0, ...(r.usage?.iterations ?? []).map((i: any) => i.input_tokens + i.cache_read_input_tokens + i.cache_creation_input_tokens)),
      subagents: r.subagent_stats?.spawned,
    },
  };
}

const found: Record<string, Set<string>> = {};
for (const runPath of runPaths) {
  const { label, candidates, stats } = candidatesOf(JSON.parse(readFileSync(runPath, "utf8")));
  const paths = new Set(candidates.map((c) => c.path));
  found[label] = new Set(kase.truth.filter((t) => paths.has(t.path)).map((t) => t.path));

  console.log(`\n=== ${label}`);
  console.log(JSON.stringify(stats));
  for (const kind of ["code", "doc", "test", "all"] as const) {
    const truth = kase.truth.filter((t) => kind === "all" || t.kind === kind);
    if (truth.length === 0) continue;
    const fileHits = truth.filter((t) => paths.has(t.path)).length;
    const hunks = truth.flatMap((t) => t.hunks.map((h) => ({ path: t.path, h })));
    const hunkHits = hunks.filter(({ path, h }) => candidates.some((c) => c.path === path && overlaps(c, h))).length;
    console.log(`  ${kind.padEnd(4)} files ${fileHits}/${truth.length}  hunks ${hunkHits}/${hunks.length}`);
  }
  const truthPaths = new Set(kase.truth.map((t) => t.path));
  const wrong = candidates.filter((c) => !truthPaths.has(c.path));
  console.log(`  candidates ${candidates.length} (${paths.size} files), not in truth: ${wrong.length} (${new Set(wrong.map((w) => w.path)).size} files)`);
  for (const t of kase.truth) console.log(`    ${paths.has(t.path) ? "HIT " : "miss"} [${t.kind}] ${t.path}`);
}

const labels = Object.keys(found);
if (labels.length >= 2) {
  const [a, b] = [labels[0]!, labels[1]!];
  const onlyB = [...found[b]!].filter((p) => !found[a]!.has(p));
  const onlyA = [...found[a]!].filter((p) => !found[b]!.has(p));
  console.log(`\nfound by "${b}" but not "${a}": ${onlyB.length ? onlyB.join(", ") : "none"}`);
  console.log(`found by "${a}" but not "${b}": ${onlyA.length ? onlyA.join(", ") : "none"}`);
}
