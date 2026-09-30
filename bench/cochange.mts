// Summarizes which files change together in a repository's history, as input for the setup
// agent (docs/records/methodology.md §5). Only commit metadata is read, never file contents,
// so it works on blobless clones.
//
// Usage: node bench/cochange.mts <repo> <until-commit> [--since 2025-01-01] > digest.md

import { execFileSync } from "node:child_process";

import { kindOf } from "./commit.mts";

export const BOT = /bot|dependabot|renovate|github-actions|weblate|crowdin|pre-commit/i;
export const SUBJECT = /^(chore\(deps|bump |build\(deps|merge |revert|new crowdin|translations?|update .*translation|release|v?\d+\.\d+|changelog|chore: release)/i;

type Commit = { subject: string; files: string[] };

// Version-like numbers in file names are one convention file across releases:
// docs/releases/6.2.txt and docs/releases/6.1.1.txt are both docs/releases/N.N.txt.
export const normalize = (path: string) => {
  const slash = path.lastIndexOf("/");
  return path.slice(0, slash + 1) + path.slice(slash + 1).replace(/\d+/g, "N");
};
const area = (path: string) => {
  const parts = path.split("/");
  return parts.length <= 1 ? "(root)" : parts.slice(0, Math.min(3, parts.length - 1)).join("/") + "/";
};

export function readHistory(repo: string, until: string, since: string): Commit[] {
  const log = execFileSync("git", ["-C", repo, "log", "--first-parent", "--no-merges", "--no-renames", `--since=${since}`, "--name-only", "--format=@@%an%x09%ae%x09%s", until], { maxBuffer: 1 << 30 }).toString();
  const commits: Commit[] = [];
  for (const block of log.split("@@").slice(1)) {
    const [header = "", ...rest] = block.split("\n");
    const [author = "", email = "", subject = ""] = header.split("\t");
    const files = rest.map((l) => l.trim()).filter(Boolean);
    // Mass changes (reformatting, big refactors) say nothing about what belongs together.
    if (BOT.test(author) || BOT.test(email) || SUBJECT.test(subject) || files.length === 0 || files.length > 40) continue;
    commits.push({ subject, files });
  }
  return commits;
}

export function digest(commits: Commit[]): string {
  const out: string[] = [];
  const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
  const withCode = commits.filter((c) => c.files.some((f) => kindOf(f) === "code"));

  // 1. Convention files: the same (normalized) file touched by many unrelated commits.
  const byFile = new Map<string, Commit[]>();
  for (const c of commits) for (const f of new Set(c.files.map(normalize))) byFile.set(f, [...(byFile.get(f) ?? []), c]);
  const conventions = [...byFile].filter(([, cs]) => cs.length >= Math.max(3, commits.length * 0.02)).sort((a, b) => b[1].length - a[1].length).slice(0, 25);
  out.push(`# Co-change digest`, ``, `${commits.length} commits (${withCode.length} touching code). Version numbers in file names are shown as N.`, ``);
  out.push(`## Files many commits touch`, ``, `| file | commits | of code commits | sample subjects |`, `| --- | --- | --- | --- |`);
  for (const [file, cs] of conventions) {
    const code = cs.filter((c) => withCode.includes(c)).length;
    const samples = cs.slice(0, 3).map((c) => c.subject.replaceAll("|", "/").slice(0, 70)).join("; ");
    out.push(`| ${file} | ${cs.length} | ${pct(code, withCode.length)} | ${samples} |`);
  }

  // 2. For each code area, what changes with it outside the area.
  const byArea = new Map<string, Commit[]>();
  for (const c of commits) for (const a of new Set(c.files.filter((f) => kindOf(f) === "code").map(area))) byArea.set(a, [...(byArea.get(a) ?? []), c]);
  out.push(``, `## What changes together with each code area`, ``, `Share of the area's commits that also touched each file or area outside it.`, ``);
  for (const [a, cs] of [...byArea].filter(([, cs]) => cs.length >= 8).sort((x, y) => y[1].length - x[1].length).slice(0, 40)) {
    const counts = new Map<string, number>();
    for (const c of cs) {
      const seen = new Set<string>();
      for (const f of c.files) {
        if (f.startsWith(a)) continue;
        // Test and doc files are listed by area; code files by area too, so the list stays short.
        for (const key of [normalize(f), area(f)]) if (!seen.has(key)) { seen.add(key); counts.set(key, (counts.get(key) ?? 0) + 1); }
      }
    }
    const top = [...counts].filter(([, n]) => n >= 3 && n / cs.length >= 0.15).sort((x, y) => y[1] - x[1]).slice(0, 8);
    out.push(`- **${a}** (${cs.length} commits): ${top.length ? top.map(([k, n]) => `${k} ${pct(n, cs.length)}`).join(", ") : "nothing above 15%"}`);
  }
  return out.join("\n");
}

if (import.meta.main) {
  const [repo, until] = process.argv.slice(2);
  const sinceFlag = process.argv.indexOf("--since");
  const since = sinceFlag > 0 ? process.argv[sinceFlag + 1]! : "2025-01-01";
  if (!repo || !until) {
    console.error("usage: node bench/cochange.mts <repo> <until-commit> [--since 2025-01-01]");
    process.exit(2);
  }
  console.log(digest(readHistory(repo, until, since)));
}
