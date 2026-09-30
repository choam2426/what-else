// JevGrep CLI for arm S (docs/records/phase0-experiment.md §2). The agent runs it from the
// repository root with a query it wrote itself; Jev answers one yes/no question per target
// for each ~60-line window, and the top windows per target come back as candidates.
//
// Candidate selection keeps a scan inside a time budget instead of scanning everything:
// a target's `paths` limit where it looks (the agent takes these from the repository rules),
// and when there are more windows than the budget, `keywords` and the question rank them.
//
// Usage: node <jevgrep>/bench/jevgrep.mts scan <query.json | -> ("-" reads the query from stdin)
// query.json: { "context": string,
//               "targets": [{ "id", "question", "paths"?: [glob or directory], "keywords"?: [string] }] }
// Env: TYPESAFE_API_KEY, JEVGREP_BUDGET (windows per scan, default 1000),
//      JEVGREP_LOG (append one JSON line per scan, for scoring).

import { appendFileSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";

import { getNoul, type NoulQuestion, type SystemOneRequest } from "../src/jev/api.mts";
import { createClient } from "../src/jev/client.mts";
import { createLimiter } from "../src/jev/limiter.mts";
import { scanUnits } from "../src/jev/scan.mts";
import { buildUnits, listFiles, type Unit } from "./units.mts";

const K = 10;
const BUDGET = Number(process.env["JEVGREP_BUDGET"] ?? 1000);

type Target = { id: string; question: string; paths?: string[]; keywords?: string[] };
type Query = { context: string; targets: Target[] };

const [command, queryPath] = process.argv.slice(2);
if (command !== "scan" || !queryPath) {
  console.error("usage: node jevgrep.mts scan <query.json | ->");
  process.exit(2);
}
// fd 0 is stdin: the agent passes the query with a heredoc and never writes a file in the repository.
let query: Query;
try {
  query = JSON.parse(readFileSync(queryPath === "-" ? 0 : queryPath, "utf8")) as Query;
} catch (error) {
  console.error(`could not read the query as JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
if (typeof query.context !== "string" || !Array.isArray(query.targets) || query.targets.length === 0) {
  console.error('query.json needs "context" (string) and "targets" (non-empty array of { id, question, paths?, keywords? })');
  process.exit(2);
}
for (const t of query.targets) {
  if (typeof t.id !== "string" || typeof t.question !== "string") {
    console.error(`every target needs "id" and "question": ${JSON.stringify(t)}`);
    process.exit(2);
  }
}

const inScope = (file: string, patterns: string[] | undefined) =>
  !patterns?.length ||
  patterns.some((p) => {
    const dir = p.replace(/\/+$/, "");
    return file === dir || file.startsWith(`${dir}/`) || matchesGlob(file, p);
  });

const files = listFiles(".");
const scoped = files.filter((f) => query.targets.some((t) => inScope(f, t.paths)));
const { units, excluded } = buildUnits(".", scoped);
const candidates = new Map(query.targets.map((t) => [t.id, units.filter((u) => inScope(u.path, t.paths))]));

// Keyword relevance (BM25) is only a way to spend the budget when a scope is too big.
const STOP = new Set("the and for that this with from are was were been have has not but any all can will should would does did into only when what which where whose there their them than then also must".split(" "));
const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
function rank(pool: Unit[], t: Target): Unit[] {
  const weights = new Map<string, number>();
  for (const w of tokens(t.question)) if (w.length >= 3 && !STOP.has(w)) weights.set(w, 1);
  for (const k of t.keywords ?? []) for (const w of tokens(k)) weights.set(w, 3);
  const docs = pool.map((u) => tokens(`${u.path} ${u.code}`));
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) if (weights.has(w)) df.set(w, (df.get(w) ?? 0) + 1);
  const score = (d: string[]) => {
    const tf = new Map<string, number>();
    for (const w of d) if (weights.has(w)) tf.set(w, (tf.get(w) ?? 0) + 1);
    let s = 0;
    for (const [w, f] of tf) {
      const idf = Math.log(1 + (pool.length - df.get(w)! + 0.5) / (df.get(w)! + 0.5));
      s += weights.get(w)! * idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.length / avg))));
    }
    return s;
  };
  return pool.map((u, i) => ({ u, s: score(docs[i]!) })).sort((a, b) => b.s - a.s).map((x) => x.u);
}

// Split the budget across targets; a target with a small scope gives its unused share to the rest.
const selected = new Map<Unit, Set<string>>();
const scannedPerTarget = new Map<string, number>();
let remaining = BUDGET;
const order = [...query.targets].sort((a, b) => candidates.get(a.id)!.length - candidates.get(b.id)!.length);
order.forEach((t, i) => {
  const pool = candidates.get(t.id)!;
  const share = Math.floor(remaining / (order.length - i));
  const picked = pool.length <= share ? pool : rank(pool, t).slice(0, share);
  for (const u of picked) selected.set(u, (selected.get(u) ?? new Set()).add(t.id));
  scannedPerTarget.set(t.id, picked.length);
  remaining -= picked.length;
});

const byId = new Map(query.targets.map((t) => [t.id, t]));
const work = [...selected.entries()];
const toRequest = ([u, ids]: [Unit, Set<string>]): SystemOneRequest => ({
  state: { context: query.context, unit: { path: u.path, lines: `${u.start}-${u.end}`, code: u.code } },
  questions: Object.fromEntries([...ids].map((id): [string, NoulQuestion] => [id, { type: "noul", instructions: byId.get(id)!.question }])),
});

const report = await scanUnits(work, toRequest, { client: createClient({ limiter: createLimiter() }), concurrency: 32 });

const hits = new Map<string, Array<{ path: string; start: number; end: number; score: number }>>();
for (const { unit: [u, ids], response } of report.succeeded) {
  for (const id of ids) hits.set(id, [...(hits.get(id) ?? []), { path: u.path, start: u.start, end: u.end, score: getNoul(response, id) }]);
}
const top = Object.fromEntries(query.targets.map((t) => [t.id, (hits.get(t.id) ?? []).sort((a, b) => b.score - a.score).slice(0, K)]));
const jevCostUsd = (report.usage.input_tokens / 1e6) * 0.042;
const summary = {
  windows: work.length,
  budget: BUDGET,
  failed: report.failed.length,
  elapsedS: Math.round(report.elapsedMs / 1000),
  inputTokens: report.usage.input_tokens,
  jevCostUsd: Number(jevCostUsd.toFixed(4)),
  excluded,
};

const logPath = process.env["JEVGREP_LOG"];
if (logPath) appendFileSync(logPath, `${JSON.stringify({ time: new Date().toISOString(), query, summary, top })}\n`);

const lines = [`Scanned ${work.length} windows in ${summary.elapsedS}s (budget ${BUDGET}).${report.failed.length ? ` ${report.failed.length} failed, so coverage is incomplete.` : ""}`];
for (const t of query.targets) {
  const pool = candidates.get(t.id)!.length;
  const scanned = scannedPerTarget.get(t.id)!;
  const files = new Set(candidates.get(t.id)!.map((u) => u.path)).size;
  lines.push("", `${t.id}: ${t.question}`);
  lines.push(`  scope: ${pool} windows in ${files} files; scanned ${scanned}${scanned < pool ? " (ranked by keywords; the rest were NOT checked)" : " (all)"}`);
  for (const h of top[t.id]!) lines.push(`  ${h.score.toFixed(2)}  ${h.path}:${h.start}-${h.end}`);
}
lines.push("", "Scores are how likely each window answers yes. These are candidates: read each one before reporting it.");
console.log(lines.join("\n"));
