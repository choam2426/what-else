// Estimates which truth files an agent could find by searching for names: a file counts as
// name-findable when, at the parent commit, it contains a distinctive identifier from the change
// (the seed diff's changed lines or the change description). Distinctive means the identifier
// appears in few tracked files, so searching for it narrows things down.
//
// Usage: node bench/findability.mts <case-dir>... [--labels a.json,b.json] [--max-files 50]
// Prints, per case, the required (or, without labels, non-test) files that no distinctive name reaches.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const caseDirs = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
const labels = (opt("labels") ?? "").split(",").filter(Boolean).reduce((all, f) => ({ ...all, ...JSON.parse(readFileSync(f, "utf8")) }), {} as Record<string, Record<string, { label: string }>>);
const maxFiles = Number(opt("max-files") ?? 50);

const COMMON = new Set("self this that with from return import class def function const None True False null true false none await async yield raise except finally elif else then while break continue pass lambda global nonlocal assert print value values data args kwargs name type list dict object string number result results error errors test tests self.assert options config param params".split(" "));

type Case = { repo: string; parent: string; seed: { path: string }; seedPatch: string; description: string; truth: Array<{ path: string; kind: string }> };

export function findability(caseDir: string) {
  const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8")) as Case;
  const git = (...args: string[]) => {
    try {
      return execFileSync("git", ["-C", kase.repo, "-c", "core.quotepath=off", ...args], { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch (error) {
      // git grep exits 1 when nothing matches.
      return String((error as { stdout?: Buffer }).stdout ?? "");
    }
  };
  const changed = kase.seedPatch.split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).join("\n");
  const words = new Set([...`${changed}\n${kase.description}`.matchAll(/[A-Za-z_][A-Za-z0-9_]{3,}/g)].map((m) => m[0]).filter((w) => !COMMON.has(w.toLowerCase())));
  // Keep identifiers that narrow the search: present in the repository, in at most maxFiles files.
  const distinctive = new Map<string, Set<string>>();
  for (const w of words) {
    const files = git("grep", "-l", "-w", "-F", w, kase.parent).split("\n").filter(Boolean).map((l) => l.slice(kase.parent.length + 1));
    if (files.length > 0 && files.length <= maxFiles) distinctive.set(w, new Set(files));
  }
  const reached = new Set([...distinctive.values()].flatMap((s) => [...s]));
  const caseLabels = labels[basename(caseDir)];
  const targets = caseLabels
    ? Object.entries(caseLabels).filter(([, v]) => v.label === "required").map(([p]) => p)
    : kase.truth.filter((t) => t.kind !== "test").map((t) => t.path);
  const unreached = targets.filter((p) => p !== kase.seed.path && !reached.has(p));
  return { targets: targets.filter((p) => p !== kase.seed.path).length, unreached, distinctive: distinctive.size };
}

if (import.meta.main) {
  let total = 0, missed = 0, cases = 0;
  for (const dir of caseDirs) {
    const f = findability(dir);
    total += f.targets;
    missed += f.unreached.length;
    if (f.unreached.length) cases++;
    console.log(`${basename(dir).padEnd(20)} ${f.unreached.length}/${f.targets} not reachable by name (${f.distinctive} distinctive names)${f.unreached.length ? `: ${f.unreached.join(", ")}` : ""}`);
  }
  console.log(`\n${missed}/${total} files not reachable by name, in ${cases}/${caseDirs.length} cases`);
}
