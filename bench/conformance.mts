// Reads an E run's events (runs/<run>.events.jsonl) and reports the spec's behavioral checks
// C2-C7 (docs/records/spec-v0.7/references/contracts.md#checks), as far as the harness log shows them.
//
// Usage: node bench/conformance.mts <case-dir> [--run E-sonnet-1]

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Block = { type?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown; text?: string };
type Event = { type?: string; parent_tool_use_id?: string | null; message?: { content?: Block[] | string }; modelUsage?: Record<string, { inputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; costUSD: number }>; structured_output?: unknown };

export type Conformance = {
  skillUsed: boolean; // C2
  agentCalls: Array<{ type: string; description: string }>; // C3
  workerModelUsed: string[]; // C3: non-main models in modelUsage
  mainReads: number; // C4: Read/Grep/Glob/Bash calls made by the main agent
  mainInputTokens: number; // C4
  brief: { change: boolean; known: boolean; whereToLook: boolean; questions: boolean } | null; // C5
  jevgrepRuns: number; // C6: Bash calls that ran the implementation's JevGrep
  jevgrepCommands: string[];
  reportLines: number; // C7: "<path>:<range> | required|optional | ..." lines in the worker's report
};

const REPORT_LINE = /^\s*[-*]?\s*`?[\w./-]+:(\d+(-\d+)?|new)`?\s*\|\s*(required|optional)\s*\|/i;

export function conformance(eventsPath: string, mainModel = "sonnet"): Conformance {
  const events = readFileSync(eventsPath, "utf8").split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as Event);
  const out: Conformance = { skillUsed: false, agentCalls: [], workerModelUsed: [], mainReads: 0, mainInputTokens: 0, brief: null, jevgrepRuns: 0, jevgrepCommands: [], reportLines: 0 };
  const agentIds = new Set<string>();
  for (const e of events) {
    const blocks = Array.isArray(e.message?.content) ? e.message!.content : [];
    const fromMain = !e.parent_tool_use_id;
    for (const b of blocks) {
      if (b.type === "tool_use") {
        if (b.name === "Skill" && /change.?scope/i.test(JSON.stringify(b.input))) out.skillUsed = true;
        if (b.name === "Agent" || b.name === "Task") {
          agentIds.add(b.id ?? "");
          const prompt = String(b.input?.["prompt"] ?? "");
          out.agentCalls.push({ type: String(b.input?.["subagent_type"] ?? "?"), description: String(b.input?.["description"] ?? "") });
          out.brief ??= {
            change: /\bchange\b/i.test(prompt),
            known: /known/i.test(prompt),
            whereToLook: /where to look|look (at|in)|easy to miss/i.test(prompt),
            questions: /jevgrep|question/i.test(prompt),
          };
        }
        if (fromMain && ["Read", "Grep", "Glob", "Bash"].includes(b.name ?? "")) out.mainReads++;
        const command = String(b.input?.["command"] ?? "");
        // The implementation's JevGrep script, wherever setup put it (not any path that says "jevgrep").
        if (b.name === "Bash" && /\.claude[\\/]+jevgrep[\\/]|jevgrep\.(py|mjs|mts|js|ts)\b/i.test(command)) {
          out.jevgrepRuns++;
          out.jevgrepCommands.push(command.split("\n")[0]!.slice(0, 160));
        }
      }
      // The worker's report is its last message. Subagents may run in the background, so it is read
      // from the worker's own messages rather than from the Agent tool result.
      if (b.type === "text" && e.parent_tool_use_id && agentIds.has(e.parent_tool_use_id)) {
        const lines = (b.text ?? "").split("\n").filter((l) => REPORT_LINE.test(l)).length;
        if (lines > 0) out.reportLines = lines;
      }
    }
    if (e.type === "result" && e.modelUsage) {
      for (const [model, u] of Object.entries(e.modelUsage)) {
        if (model.includes(mainModel)) out.mainInputTokens += u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
        else out.workerModelUsed.push(model);
      }
    }
  }
  return out;
}

if (import.meta.main) {
  const [caseDir] = process.argv.slice(2);
  const i = process.argv.indexOf("--run");
  const run = i > 0 ? process.argv[i + 1]! : "E-sonnet-1";
  const path = join(caseDir ?? "", "runs", `${run}.events.jsonl`);
  if (!caseDir || !existsSync(path)) {
    console.error("usage: node bench/conformance.mts <case-dir> [--run E-sonnet-1]");
    process.exit(2);
  }
  console.log(JSON.stringify(conformance(path), null, 2));
}
