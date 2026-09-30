// Builds a realistic-benchmark case (make-real-case.mts) from a SWE-bench Pro instance: the
// repository at the instance's base commit, the problem statement as the request, and the files
// the gold patch changes as the truth. Requirements and interface fields are left out, since they
// name the files and would give the scope away.
//
// Usage: node bench/make-pro-case.mts <repo-dir> <instance.json> <out-dir> [--install <setup-repo>]
//   <instance.json> is one row of the SWE-bench Pro dataset.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { kindOf } from "./commit.mts";
import { commitSnapshot, exportTree } from "./snapshot.mts";

const [repo, instancePath, outDir] = process.argv.slice(2);
const i = process.argv.indexOf("--install");
const setupRepo = i > 0 ? process.argv[i + 1] : undefined;
if (!repo || !instancePath || !outDir) {
  console.error("usage: node bench/make-pro-case.mts <repo-dir> <instance.json> <out-dir> [--install <setup-repo>]");
  process.exit(2);
}
if (existsSync(outDir)) {
  console.error(`${outDir} already exists`);
  process.exit(2);
}

type Instance = { instance_id: string; repo: string; base_commit: string; patch: string; problem_statement: string };
const inst = JSON.parse(readFileSync(instancePath, "utf8")) as Instance;

// Files the gold patch touches: pre-existing ones are the truth; new ones are scored separately
// (a new file counts when the agent adds one in the same directory, e.g. a changelog fragment).
const TEST = /(^|\/)(tests?|__tests__|spec|testdata|fixtures?|mocks?)\/|[._-](test|spec)\.[a-z]+$|_test\.go$|(^|\/)test_[^/]+\.py$/i;
const blocks = inst.patch.split(/^(?=diff --git )/m).filter((b) => b.startsWith("diff --git"));
const files = blocks.map((b) => ({ path: b.match(/^diff --git a\/(\S+) b\/(\S+)/)![2]!, added: /^new file mode/m.test(b), deleted: /^deleted file mode/m.test(b) }));
const truth = files.filter((f) => !f.added).map((f) => ({ path: f.path, status: f.deleted ? "D" : "M", kind: TEST.test(f.path) ? "test" : kindOf(f.path) }));
const newFiles = files.filter((f) => f.added && !TEST.test(f.path)).map((f) => f.path);

const snapshot = join(outDir, "snapshot");
mkdirSync(outDir, { recursive: true });
exportTree(repo, inst.base_commit, snapshot);
commitSnapshot(snapshot);

if (setupRepo) {
  execFileSync(process.execPath, [fileURLToPath(new URL("./run-e2e.mts", import.meta.url)), "install", setupRepo, outDir], { stdio: "inherit" });
  const git = (...args: string[]) => execFileSync("git", ["-C", snapshot, "-c", "core.longpaths=true", ...args]);
  git("-c", "core.autocrlf=false", "add", "-A");
  git("-c", "user.name=bench", "-c", "user.email=bench@example.invalid", "commit", "-q", "-m", "install change-scope implementation");
}

const required = truth.filter((t) => t.kind !== "test").map((t) => t.path);
writeFileSync(join(outDir, "case.json"), JSON.stringify({
  repo, commit: inst.instance_id, parent: inst.base_commit,
  // No seed in this benchmark: the agent makes the whole change. The first required file stands in
  // for it so the scorer's "labels + seed" rule adds nothing.
  seed: { path: required[0] ?? "" },
  request: inst.problem_statement, description: inst.problem_statement, truth, newFiles, source: inst.instance_id,
}, null, 2));
console.log(`pro case written to ${outDir}: ${required.length} required, ${newFiles.length} new${setupRepo ? " (implementation installed)" : ""}`);
