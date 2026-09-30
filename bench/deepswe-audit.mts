// Integrity check for DeepSWE trials (docs/records/baseline-deepswe.md): lists every tool call that
// could have reached the answer — the held-out solution or tests, git history beyond the base
// commit, or the network. Heredoc bodies and commit messages are text the agent wrote, not places
// it reached, so they are stripped before matching.
//
// Usage: node bench/deepswe-audit.mts <jobs-dir>

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const jobsDir = process.argv[2];
if (!jobsDir) {
  console.error("usage: node bench/deepswe-audit.mts <jobs-dir>");
  process.exit(2);
}

const reaches: Array<[string, RegExp]> = [
  ["held-out files", /(^|[\s'"=:(])\/(solution|tests)(\/|\s|$)|\bsolve\.sh\b|\bgrader\.py\b|\btest\.patch\b/],
  ["git history", /\bgit\s+(log|show|rev-list|reflog|cat-file)\b[^|;&]*(--all|--branches|--remotes|[0-9a-f]{7,40})|\bgit\s+(fetch|pull|clone|remote)\b|\.git\/(objects|refs|packed-refs)/],
  ["network", /\b(curl|wget)\s|https?:\/\/(?!localhost|127\.0\.0\.1)/],
];

const dirs = (d: string) => readdirSync(d).filter((n) => statSync(join(d, n)).isDirectory());
let trials = 0;
let flagged = 0;
for (const job of dirs(jobsDir)) {
  for (const trial of dirs(join(jobsDir, job))) {
    const log = join(jobsDir, job, trial, "agent", "claude-code.txt");
    if (!existsSync(log)) continue;
    trials++;
    const hits: string[] = [];
    for (const line of readFileSync(log, "utf8").split("\n")) {
      if (!line.startsWith("{")) continue;
      let event: { message?: { content?: Array<{ type?: string; name?: string; input?: Record<string, unknown> }> } };
      try { event = JSON.parse(line); } catch { continue; }
      for (const block of event.message?.content ?? []) {
        if (block.type !== "tool_use") continue;
        const input = block.input ?? {};
        const target = [input["command"], input["file_path"], input["path"], input["url"]].filter((v) => typeof v === "string").join(" ");
        const reach = target
          .replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\1(?=\s|$)/g, "<<heredoc")
          .replace(/(-m|--message)\s+("([^"\\]|\\.)*"|'[^']*')/g, "-m <message>");
        for (const [kind, pattern] of reaches) if (pattern.test(reach)) hits.push(`${kind}: ${block.name}: ${reach.replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
    if (hits.length) {
      flagged++;
      console.log(`== ${trial}`);
      for (const h of hits) console.log(`  ${h}`);
    }
  }
}
console.log(`${trials} trials checked, ${flagged} with calls to review`);
