// Offline what-if on a full scan: if only a BM25 shortlist of N units had been sent to Jev,
// which ground-truth files would still be found? Costs nothing: it reuses the scan's scores.
//
// Usage: node bench/simulate-shortlist.mts <case-dir> <scan.json> [--k 20]
// Units are rebuilt from the snapshot with the scan's own window/overlap, so they line up.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const [caseDir, scanPath] = process.argv.slice(2);
const kFlag = process.argv.indexOf("--k");
const K = kFlag > 0 ? Number(process.argv[kFlag + 1]) : 20;
if (!caseDir || !scanPath) {
  console.error("usage: node bench/simulate-shortlist.mts <case-dir> <scan.json> [--k 20]");
  process.exit(2);
}

type Scored = { path: string; start: number; end: number; scores: Record<string, number> };
type Truth = { path: string; kind: string; hunks: Array<{ start: number; end: number }> };
const scan = JSON.parse(readFileSync(scanPath, "utf8")) as {
  query: { context: string; targets: Array<{ id: string; instructions: string; criteria?: { true: string } }> };
  scored: Scored[];
};
const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8")) as { seed: { path: string }; truth: Truth[] };
const snapshot = join(caseDir, "snapshot");

// Tokens: identifiers split on snake_case and camelCase, lowercased, short and stop words dropped.
const STOP = new Set("the a an and or of to in on for is are be this that with as by it its from at not no if else code window whether check contains does any such e.g".split(" "));
const tokenize = (text: string) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

const fileCache = new Map<string, string[]>();
const linesOf = (path: string) => {
  let lines = fileCache.get(path);
  if (!lines) {
    lines = readFileSync(join(snapshot, path), "utf8").split("\n");
    fileCache.set(path, lines);
  }
  return lines;
};
// The path is part of the document: a file's location is strong evidence (docs/releases, .github).
const docs = scan.scored.map((u) => tokenize(`${u.path} ${linesOf(u.path).slice(u.start - 1, u.end).join("\n")}`));

const queryText = [scan.query.context, ...scan.query.targets.map((t) => `${t.instructions} ${t.criteria?.true ?? ""}`)].join(" ");
const queryTerms = [...new Set(tokenize(queryText))];

// Okapi BM25 over units.
const k1 = 1.2;
const b = 0.75;
const avgLen = docs.reduce((s, d) => s + d.length, 0) / docs.length;
const df = new Map<string, number>();
for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
const idf = (t: string) => Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
const bm25 = docs.map((d) => {
  const tf = new Map<string, number>();
  for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
  let s = 0;
  for (const q of queryTerms) {
    const f = tf.get(q);
    if (f) s += idf(q) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen)));
  }
  return s;
});

const order = scan.scored.map((_, i) => i).sort((a, b2) => bm25[b2]! - bm25[a]!);
const bm25Rank = new Map(order.map((i, r) => [i, r]));
const isTruthUnit = (u: Scored) =>
  kase.truth.some((t) => t.path === u.path && t.hunks.some((h) => u.start <= h.end && u.end >= h.start));

console.log(`units ${scan.scored.length}, query terms ${queryTerms.length}, k ${K} per target`);
console.log("\nbest BM25 rank of any unit overlapping each truth file:");
for (const t of kase.truth) {
  const ranks = scan.scored.map((u, i) => (u.path === t.path && isTruthUnit(u) ? bm25Rank.get(i)! : Infinity));
  console.log(`  ${String(Math.min(...ranks)).padStart(6)}  [${t.kind}] ${t.path}`);
}

const topKFiles = (pool: number[]) => {
  const found = new Set<string>();
  for (const target of scan.query.targets) {
    const top = [...pool].sort((a, b2) => scan.scored[b2]!.scores[target.id]! - scan.scored[a]!.scores[target.id]!).slice(0, K);
    for (const i of top) if (isTruthUnit(scan.scored[i]!)) found.add(scan.scored[i]!.path);
  }
  return found;
};

console.log("\nshortlist size → truth files reachable in shortlist / found in Jev top-k (seed file always added)");
for (const n of [250, 500, 1000, 2000, 4000, scan.scored.length]) {
  const pool = order.slice(0, n);
  // Seed neighborhood: every unit of the seed file joins the shortlist.
  scan.scored.forEach((u, i) => { if (u.path === kase.seed.path && !pool.includes(i)) pool.push(i); });
  const reachable = new Set(pool.filter((i) => isTruthUnit(scan.scored[i]!)).map((i) => scan.scored[i]!.path));
  const found = topKFiles(pool);
  const seconds = Math.round(pool.length / 20);
  console.log(`  ${String(n).padStart(6)} (~${seconds}s at 20/s)  reachable ${reachable.size}/${kase.truth.length}  found ${found.size}/${kase.truth.length}  [${[...found].map((p) => p.split("/").pop()).join(", ")}]`);
}
