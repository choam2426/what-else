// Collects DeepSWE baseline trials run with Pier (docs/records/baseline-deepswe.md): per trial, the
// verifier's reward, the agent's cost, time and turns from Claude Code's stream-json log, and which
// files of the reference solution the agent's patch left untouched.
//
// Usage: node bench/deepswe-collect.mts <jobs-dir> <deep-swe-tasks-dir> [--json out.json]
// Trials that ended in an exception are listed with the exception type and left out of the means.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [jobsDir, tasksDir] = process.argv.slice(2);
if (!jobsDir || !tasksDir) {
  console.error("usage: node bench/deepswe-collect.mts <jobs-dir> <deep-swe-tasks-dir> [--json out.json]");
  process.exit(2);
}
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : undefined;

type Trial = {
  task: string; trial: string; model: string; agentVersion: string;
  reward: number | null; f2p: number | null; p2p: number | null; exception?: string;
  costUsd: number | null; agentSeconds: number | null; turns: number | null;
  refFiles: string[]; agentFiles: string[]; missedRefFiles: string[];
};

const dirs = (d: string) => readdirSync(d).filter((n) => statSync(join(d, n)).isDirectory());
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const patchFiles = (patch: string) => [...patch.matchAll(/^diff --git a\/\S+ b\/(\S+)$/gm)].map((m) => m[1]!).sort();

const trials: Trial[] = [];
for (const job of dirs(jobsDir)) {
  for (const name of dirs(join(jobsDir, job))) {
    const dir = join(jobsDir, job, name);
    const result = read(join(dir, "result.json"));
    if (!result) continue;
    const r = JSON.parse(result) as {
      task_name: string; agent_info?: { version?: string; model_info?: { name?: string } };
      verifier_result?: { rewards?: { reward?: number } }; exception_info?: { exception_type?: string } | null;
    };
    const task = r.task_name.replace(/^datacurve\//, "");
    const reward = read(join(dir, "verifier", "reward.json"));
    const scores = reward ? (JSON.parse(reward) as { reward: number; f2p: number; p2p: number }) : null;
    // The last "result" event of Claude Code's stream-json output carries cost, turns and duration.
    const final = read(join(dir, "agent", "claude-code.txt")).split("\n").filter((l) => l.includes('"type":"result"')).pop();
    const f = final ? (JSON.parse(final) as { total_cost_usd?: number; num_turns?: number; duration_ms?: number }) : {};
    const refFiles = patchFiles(read(join(tasksDir, task, "solution", "solution.patch")));
    const agentFiles = patchFiles(read(join(dir, "artifacts", "model.patch")));
    trials.push({
      task, trial: name, model: r.agent_info?.model_info?.name ?? "", agentVersion: r.agent_info?.version ?? "",
      reward: scores?.reward ?? null, f2p: scores?.f2p ?? null, p2p: scores?.p2p ?? null,
      ...(r.exception_info?.exception_type ? { exception: r.exception_info.exception_type } : {}),
      costUsd: f.total_cost_usd ?? null, agentSeconds: f.duration_ms != null ? Math.round(f.duration_ms / 1000) : null, turns: f.num_turns ?? null,
      refFiles, agentFiles, missedRefFiles: refFiles.filter((p) => !agentFiles.includes(p)),
    });
  }
}

const ok = trials.filter((t) => !t.exception && t.reward !== null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
for (const t of trials) {
  const status = t.exception ? `EXCEPTION ${t.exception}` : `reward ${t.reward} f2p ${t.f2p?.toFixed(2)} p2p ${t.p2p?.toFixed(2)}`;
  const files = `files ${t.refFiles.length - t.missedRefFiles.length}/${t.refFiles.length}${t.missedRefFiles.length ? ` missed ${t.missedRefFiles.join(", ")}` : ""}`;
  console.log(`${t.task} | ${status} | $${t.costUsd?.toFixed(2) ?? "?"} ${t.agentSeconds ?? "?"}s ${t.turns ?? "?"} turns | ${files}`);
}
const refTotal = ok.reduce((s, t) => s + t.refFiles.length, 0);
const missedTotal = ok.reduce((s, t) => s + t.missedRefFiles.length, 0);
console.log(`\n${ok.length} graded trials (${trials.length - ok.length} exceptions): pass ${ok.filter((t) => t.reward === 1).length}/${ok.length}, ` +
  `mean f2p ${mean(ok.map((t) => t.f2p ?? 0)).toFixed(2)}, reference files touched ${refTotal - missedTotal}/${refTotal}, ` +
  `mean $${mean(ok.map((t) => t.costUsd ?? 0)).toFixed(2)}, mean ${Math.round(mean(ok.map((t) => t.agentSeconds ?? 0)))}s`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(trials, null, 2));
