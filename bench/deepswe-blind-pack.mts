// Builds a blind judging pack for a paired scope-miss comparison (docs/records/baseline-deepswe.md):
// for each task, the agent patches of two arms are copied as A.patch and B.patch in a random order,
// so a judge cannot tell from paths or names which arm a patch came from. The key goes to a separate
// file the judge is not given.
//
// Usage: node bench/deepswe-blind-pack.mts <bench-dir> <tasks-file> <arm1-jobs-dir> <arm2-jobs-dir> <out-dir>
//   writes <out-dir>/<task>/{A,B}.patch, <out-dir>/tasks.json (what the judge reads) and
//   <out-dir>.key.json (which arm each label is).

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [bench, tasksFile, arm1, arm2, out] = process.argv.slice(2);
if (!bench || !tasksFile || !arm1 || !arm2 || !out) {
  console.error("usage: node bench/deepswe-blind-pack.mts <bench-dir> <tasks-file> <arm1-jobs-dir> <arm2-jobs-dir> <out-dir>");
  process.exit(2);
}

// The newest graded trial of each task in a jobs dir.
function trials(jobsDir: string) {
  const found = new Map<string, string>();
  const jobs = readdirSync(jobsDir).filter((j) => statSync(join(jobsDir, j)).isDirectory()).sort();
  for (const job of jobs) {
    for (const t of readdirSync(join(jobsDir, job))) {
      const dir = join(jobsDir, job, t);
      const result = join(dir, "result.json");
      if (!existsSync(result) || !existsSync(join(dir, "artifacts", "model.patch"))) continue;
      const r = JSON.parse(readFileSync(result, "utf8")) as { task_name: string; exception_info?: unknown };
      if (r.exception_info) continue;
      found.set(r.task_name.replace(/^datacurve\//, ""), dir);
    }
  }
  return found;
}

// Agent instruction and note files would reveal the arm and are not part of the change being judged.
function withoutAgentNotes(patch: string) {
  return patch
    .split(/(?=^diff --git )/m)
    .filter((s) => {
      const path = s.match(/^diff --git a\/(\S+) b\//)?.[1] ?? "";
      return !(/^(CLAUDE|AGENTS)\.md$/.test(path) || path.startsWith(".claude/") || /what-?else|scope-notes|change-notes/i.test(path));
    })
    .join("");
}

const a1 = trials(arm1);
const a2 = trials(arm2);
const tasks = readFileSync(tasksFile, "utf8").trim().split("\n").map((t) => t.trim());
const key: Record<string, { A: string; B: string }> = {};
const pack: Array<{ task: string; request: string; reference: string; tests: string; A: string; B: string }> = [];
let seed = 20261002;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (const task of tasks) {
  const d1 = a1.get(task);
  const d2 = a2.get(task);
  if (!d1 || !d2) {
    console.log(`SKIP ${task}: missing a trial in ${d1 ? arm2 : arm1}`);
    continue;
  }
  const flip = rand() < 0.5;
  const [dA, dB] = flip ? [d2, d1] : [d1, d2];
  key[task] = { A: flip ? arm2 : arm1, B: flip ? arm1 : arm2 };
  mkdirSync(join(out, task), { recursive: true });
  writeFileSync(join(out, task, "A.patch"), withoutAgentNotes(readFileSync(join(dA, "artifacts", "model.patch"), "utf8")));
  writeFileSync(join(out, task, "B.patch"), withoutAgentNotes(readFileSync(join(dB, "artifacts", "model.patch"), "utf8")));
  const taskDir = join(bench, "deep-swe", "tasks", task);
  pack.push({ task, request: join(taskDir, "instruction.md"), reference: join(taskDir, "solution", "solution.patch"), tests: join(taskDir, "tests", "test.patch"), A: join(out, task, "A.patch"), B: join(out, task, "B.patch") });
}
writeFileSync(join(out, "tasks.json"), JSON.stringify(pack, null, 1));
writeFileSync(`${out}.key.json`, JSON.stringify(key, null, 1));
console.log(`${pack.length} tasks packed into ${out}`);
