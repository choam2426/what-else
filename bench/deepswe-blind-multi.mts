// Builds a blind judging pack that puts several arms of the same task side by side
// (docs/records/baseline-deepswe.md): for each task, the newest graded trial of each arm is copied as
// A.patch, B.patch, ... in a random order per task, with agent instruction and note files removed, so
// one judge scores every arm of a task by the same standard without knowing which is which.
//
// Usage: node bench/deepswe-blind-multi.mts <bench-dir> <tasks-file> <out-dir> <arm-jobs-dir>...
//   writes <out-dir>/<task>/<label>.patch, <out-dir>/tasks.json (what the judge reads) and
//   <out-dir>.key.json (which arm each label is).

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [bench, tasksFile, out, ...arms] = process.argv.slice(2);
if (!bench || !tasksFile || !out || arms.length < 2) {
  console.error("usage: node bench/deepswe-blind-multi.mts <bench-dir> <tasks-file> <out-dir> <arm-jobs-dir> <arm-jobs-dir>...");
  process.exit(2);
}

function trials(jobsDir: string) {
  const found = new Map<string, string>();
  for (const job of readdirSync(jobsDir).filter((j) => statSync(join(jobsDir, j)).isDirectory()).sort()) {
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
      return !(/^(CLAUDE|AGENTS)\.md$/.test(path) || path.startsWith(".claude/") || path.startsWith(".what-else/") || /what-?else|scope-notes|change-notes/i.test(path));
    })
    .join("");
}

const found = arms.map(trials);
const tasks = readFileSync(tasksFile, "utf8").trim().split("\n").map((t) => t.trim());
const labels = "ABCDEFGH".slice(0, arms.length).split("");
let seed = 20261006;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const key: Record<string, Record<string, string>> = {};
const pack: Array<Record<string, string>> = [];
for (const task of tasks) {
  const dirs = found.map((f) => f.get(task));
  if (dirs.some((d) => !d)) {
    console.log(`SKIP ${task}: missing in ${arms.filter((_, i) => !dirs[i]).join(", ")}`);
    continue;
  }
  const order = arms.map((_, i) => i).sort(() => rand() - 0.5);
  key[task] = {};
  const entry: Record<string, string> = { task };
  const taskDir = join(bench, "deep-swe", "tasks", task);
  Object.assign(entry, { request: join(taskDir, "instruction.md"), reference: join(taskDir, "solution", "solution.patch"), tests: join(taskDir, "tests", "test.patch") });
  mkdirSync(join(out, task), { recursive: true });
  order.forEach((armIndex, i) => {
    const label = labels[i]!;
    key[task]![label] = arms[armIndex]!;
    const file = join(out, task, `${label}.patch`);
    writeFileSync(file, withoutAgentNotes(readFileSync(join(dirs[armIndex]!, "artifacts", "model.patch"), "utf8")));
    entry[label] = file;
  });
  pack.push(entry);
}
writeFileSync(join(out, "tasks.json"), JSON.stringify(pack, null, 1));
writeFileSync(`${out}.key.json`, JSON.stringify(key, null, 1));
console.log(`${pack.length} tasks, ${arms.length} arms each, packed into ${out}`);
