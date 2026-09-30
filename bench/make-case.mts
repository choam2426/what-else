// Builds one Phase 0 case from a real commit (docs/records/phase0-experiment.md §4):
// a history-free snapshot of the parent commit with one seed hunk applied,
// plus the rest of the commit as ground truth.
//
// Usage: node bench/make-case.mts <repo-dir> <commit> <out-dir>

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkSyntax } from "./check-syntax.mts";
import { readCommit } from "./commit.mts";
import { commitSnapshot, exportTree } from "./snapshot.mts";

const [repo, commit, outDir] = process.argv.slice(2);
if (!repo || !commit || !outDir) {
  console.error("usage: node bench/make-case.mts <repo-dir> <commit> <out-dir>");
  process.exit(2);
}
if (existsSync(outDir)) {
  console.error(`${outDir} already exists`);
  process.exit(2);
}

const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { maxBuffer: 1 << 30 }).toString();
const { commit: full, parent, message, files, seedFile, seedHunk, truth } = readCommit(repo, commit);

// Snapshot: parent tree only, applied seed, fresh history.
const snapshot = join(outDir, "snapshot");
exportTree(repo, parent, snapshot);
const seedPath = join(snapshot, seedFile.path);
const original = readFileSync(seedPath, "utf8").split("\n");
// With --unified=0, oldLines=0 means "insert after line oldStart".
const at = seedHunk.oldLines === 0 ? seedHunk.oldStart : seedHunk.oldStart - 1;
original.splice(at, seedHunk.oldLines, ...seedHunk.newLines);
writeFileSync(seedPath, original.join("\n"));
commitSnapshot(snapshot);

// The seed is committed with the snapshot; show it to the agent as a diff against the parent version.
writeFileSync(join(outDir, "seed.parent"), git("show", `${parent}:${seedFile.path}`));
const seedPatch = (() => {
  // Relative paths from outDir keep Windows drive paths out of the diff headers.
  const args = ["diff", "--no-index", "--unified=3", "seed.parent", `snapshot/${seedFile.path}`];
  try {
    execFileSync("git", args, { cwd: outDir, encoding: "utf8" });
    return "";
  } catch (error) {
    // git diff --no-index exits 1 when files differ; stdout holds the diff.
    return String((error as { stdout?: string }).stdout ?? "")
      .replaceAll("a/seed.parent", `a/${seedFile.path}`)
      .replaceAll(`b/snapshot/${seedFile.path}`, `b/${seedFile.path}`);
  }
})();
rmSync(join(outDir, "seed.parent"), { force: true });

// Change description: the commit message with file paths removed (they would leak the answer).
let description = message;
for (const f of files) {
  description = description.replaceAll(f.path, "<path>");
  const base = f.path.split("/").pop()!;
  if (base.length > 4) description = description.replaceAll(base, "<file>");
}

writeFileSync(join(outDir, "case.json"), JSON.stringify({
  repo, commit: full, parent, seed: { path: seedFile.path, oldStart: seedHunk.oldStart, oldLines: seedHunk.oldLines },
  description, seedPatch, truth,
}, null, 2));

const syntax = checkSyntax(seedPath);

console.log(`case written to ${outDir}`);
console.log(`seed: ${seedFile.path} @${seedHunk.oldStart} (-${seedHunk.removed}/+${seedHunk.added})`);
console.log(`seed syntax: ${typeof syntax === "string" ? syntax : `BROKEN ${syntax.broken}`}`);
console.log(`truth: ${truth.length} files (${truth.filter((t) => t.kind === "code").length} code, ${truth.filter((t) => t.kind === "doc").length} doc, ${truth.filter((t) => t.kind === "test").length} test)`);
