// Builds a case for the realistic benchmark (docs/records/e2e-benchmark.md §11): the parent commit
// as it was, no seed applied, and the commit message as the request. The agent makes the whole
// change itself, and its final diff is scored against the files the commit had to change.
//
// Usage: node bench/make-real-case.mts <case-dir> <out-dir> [--install <setup-repo>]
//   <case-dir> is an existing Phase 0 case (its case.json gives the repo, commit and truth).
//   --install puts an implementation built from the spec into the snapshot and commits it, so it
//   is part of the starting state and never shows up in the agent's diff.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { commitSnapshot, exportTree } from "./snapshot.mts";

const [caseDir, outDir] = process.argv.slice(2);
const i = process.argv.indexOf("--install");
const setupRepo = i > 0 ? process.argv[i + 1] : undefined;
if (!caseDir || !outDir) {
  console.error("usage: node bench/make-real-case.mts <case-dir> <out-dir> [--install <setup-repo>]");
  process.exit(2);
}
if (existsSync(outDir)) {
  console.error(`${outDir} already exists`);
  process.exit(2);
}

const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8")) as { repo: string; commit: string; parent: string; seed: { path: string }; description: string; truth: Array<{ path: string; kind: string }> };
const snapshot = join(outDir, "snapshot");
mkdirSync(outDir, { recursive: true });
exportTree(kase.repo, kase.parent, snapshot);
commitSnapshot(snapshot);

if (setupRepo) {
  execFileSync(process.execPath, [fileURLToPath(new URL("./run-e2e.mts", import.meta.url)), "install", setupRepo, outDir], { stdio: "inherit" });
  const git = (...args: string[]) => execFileSync("git", ["-C", snapshot, "-c", "core.longpaths=true", ...args]);
  git("-c", "core.autocrlf=false", "add", "-A");
  git("-c", "user.name=bench", "-c", "user.email=bench@example.invalid", "commit", "-q", "-m", "install change-scope implementation");
}

// The seed file is part of the change here, so it belongs to the truth like every other file.
const truthPaths = new Set(kase.truth.map((t) => t.path));
const truth = [...kase.truth, ...(truthPaths.has(kase.seed.path) ? [] : [{ path: kase.seed.path, kind: "code", seed: true }])];
writeFileSync(join(outDir, "case.json"), JSON.stringify({ ...kase, truth, request: kase.description, source: caseDir }, null, 2));
console.log(`real case written to ${outDir}${setupRepo ? " (implementation installed and committed)" : ""}`);
