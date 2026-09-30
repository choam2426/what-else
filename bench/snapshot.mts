// Exports one commit's tree into a fresh repository with no history, so an agent working in it
// cannot see later commits (docs/records/phase0-experiment.md §4). Shared by make-case and setup.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export function exportTree(repo: string, commit: string, dir: string): void {
  mkdirSync(dir, { recursive: true });
  // A throwaway index keeps the source repo's own index untouched.
  const index = join(dirname(dir), `${Date.now()}.export.index`);
  execFileSync("git", ["-C", repo, "-c", "core.longpaths=true", "-c", "core.autocrlf=false", "-c", "core.eol=lf", `--work-tree=${dir}`, "checkout", commit, "--", "."], {
    env: { ...process.env, GIT_INDEX_FILE: index },
    maxBuffer: 1 << 30,
  });
  rmSync(index, { force: true });
  // Checkout has left partial trees behind on Windows (files locked by another process), so
  // check that every file of the commit is there before anything is built on it.
  const tree = execFileSync("git", ["-C", repo, "-c", "core.quotepath=off", "ls-tree", "-r", "-z", "--name-only", commit], { maxBuffer: 1 << 30 }).toString().split("\0").filter(Boolean);
  // Names Windows cannot hold (e.g. "build:all.sh") are skipped by checkout on every run the same
  // way, so they are reported rather than treated as a broken snapshot.
  const invalidOnWindows = (path: string) => process.platform === "win32" && /[:*?"<>|]/.test(path);
  const missing = tree.filter((path) => !existsSync(join(dir, path)));
  const skipped = missing.filter(invalidOnWindows);
  const broken = missing.filter((path) => !invalidOnWindows(path));
  if (broken.length > 0) throw new Error(`snapshot of ${commit} is missing ${broken.length} of ${tree.length} files`);
  if (skipped.length > 0) console.warn(`snapshot of ${commit}: skipped ${skipped.length} files whose names Windows cannot hold`);
}

export function commitSnapshot(dir: string): void {
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "core.longpaths=true", ...args], { maxBuffer: 1 << 30 });
  git("init", "-q");
  git("-c", "core.autocrlf=false", "add", "-A");
  git("-c", "user.name=bench", "-c", "user.email=bench@example.invalid", "commit", "-q", "-m", "snapshot");
}
