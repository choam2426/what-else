// Minimal Phase 0 scanner (docs/records/phase0-experiment.md §5): line windows over
// `git ls-files`, one unit per request, one noul question per target, top k per target.
//
// Usage: node bench/scan.mts <repo-dir> <query.json> <out.json> [--window 60] [--overlap 10] [--k 10]
// query.json: { "context": string, "targets": [{ "id", "instructions", "criteria": { "true", "false" } }] }

import { readFileSync, writeFileSync } from "node:fs";

import { getNoul, type NoulQuestion, type SystemOneRequest } from "../src/jev/api.mts";
import { createClient, type Client } from "../src/jev/client.mts";
import { createLimiter } from "../src/jev/limiter.mts";
import { scanUnits } from "../src/jev/scan.mts";
import { buildUnits, listFiles, type Unit } from "./units.mts";

const [repo, queryPath, outPath] = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const WINDOW = flag("window", 60);
const OVERLAP = flag("overlap", 10);
const K = flag("k", 10);
if (!repo || !queryPath || !outPath) {
  console.error("usage: node bench/scan.mts <repo-dir> <query.json> <out.json> [--window 60] [--overlap 10] [--k 10]");
  process.exit(2);
}

type Target = { id: string; instructions: string; criteria?: { true: string; false: string } };
const query = JSON.parse(readFileSync(queryPath, "utf8")) as { context: string; targets: Target[] };

const files = listFiles(repo);
const { units, excluded } = buildUnits(repo, files, WINDOW, OVERLAP);

const questions: Record<string, NoulQuestion> = Object.fromEntries(
  query.targets.map((t) => [t.id, { type: "noul", instructions: t.instructions, ...(t.criteria ? { criteria: t.criteria } : {}) }]),
);
const toRequest = (u: Unit): SystemOneRequest => ({
  state: { context: query.context, unit: { path: u.path, lines: `${u.start}-${u.end}`, code: u.code } },
  questions,
});

// Progress on stderr: a full scan of a large repo takes minutes.
const base = createClient({ limiter: createLimiter() });
let done = 0;
const started = performance.now();
const client: Client = {
  async systemOne(request) {
    try {
      return await base.systemOne(request);
    } finally {
      done++;
      if (done % 500 === 0 || done === units.length) {
        const s = (performance.now() - started) / 1000;
        process.stderr.write(`  ${done}/${units.length} units, ${s.toFixed(0)}s, ${(done / s).toFixed(1)}/s\n`);
      }
    }
  },
};

console.log(`scanning ${units.length} units from ${files.length - Object.values(excluded).reduce((a, b) => a + b, 0)} files (excluded ${JSON.stringify(excluded)}), ${query.targets.length} targets`);
const report = await scanUnits(units, toRequest, { client, concurrency: 32 });

const scored = report.succeeded.map(({ unit, response }) => ({
  path: unit.path,
  start: unit.start,
  end: unit.end,
  scores: Object.fromEntries(query.targets.map((t) => [t.id, getNoul(response, t.id)])),
}));
const top = Object.fromEntries(
  query.targets.map((t) => [t.id, [...scored].sort((a, b) => b.scores[t.id]! - a.scores[t.id]!).slice(0, K)]),
);
const errors: Record<string, number> = {};
for (const f of report.failed) {
  const key = f.error instanceof Error ? f.error.message.slice(0, 80) : String(f.error);
  errors[key] = (errors[key] ?? 0) + 1;
}

const elapsedS = report.elapsedMs / 1000;
const summary = {
  units: units.length,
  succeeded: report.succeeded.length,
  failed: report.failed.length,
  errors,
  excluded,
  elapsedS: Math.round(elapsedS),
  unitsPerS: Number((report.succeeded.length / elapsedS).toFixed(1)),
  usage: report.usage,
  jevCostUsd: Number(((report.usage.input_tokens / 1e6) * 0.042).toFixed(4)),
  window: WINDOW,
  overlap: OVERLAP,
  k: K,
};
writeFileSync(outPath, JSON.stringify({ summary, query, top, scored }, null, 0));

console.log(JSON.stringify(summary, null, 2));
for (const t of query.targets) {
  console.log(`\n${t.id}  ${t.instructions}`);
  for (const u of top[t.id]!) console.log(`  ${u.scores[t.id]!.toFixed(2)}  ${u.path}:${u.start}-${u.end}`);
}
