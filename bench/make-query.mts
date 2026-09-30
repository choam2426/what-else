// Has a harness model write JevGrep's query (change context + targets) from the change
// description and seed diff only, the way the main agent would (design §3-4).
// Tools are denied, so the targets come from the change itself, not from exploring the repo.
//
// Usage: node bench/make-query.mts <case-dir> <out-query.json> [--model sonnet]

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [caseDir, outPath] = process.argv.slice(2);
const modelFlag = process.argv.indexOf("--model");
const model = modelFlag > 0 ? process.argv[modelFlag + 1]! : "sonnet";
if (!caseDir || !outPath) {
  console.error("usage: node bench/make-query.mts <case-dir> <out-query.json> [--model sonnet]");
  process.exit(2);
}
const kase = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8")) as { description: string; seedPatch: string };

const prompt = `You are preparing a semantic scan of a codebase with a classifier that judges one ~60-line code window at a time.
It answers yes/no questions about the window and cannot reason across files or follow references.

A change was just made:

Change description:
${kase.description}

Diff of the change:
\`\`\`diff
${kase.seedPatch}
\`\`\`

Write:
1. "context": one or two English sentences stating what changed, including the before/after contract.
2. "targets": 3 to 8 yes/no questions, each describing a KIND of code or text that must also change because of this change.
   - Describe what the code does, not which words it mentions ("constructs a User without an email", not "mentions email").
   - Each question must be answerable from the window alone, in one step.
   - Cover places outside code too if relevant: docs, release notes, configuration, tests, CI.
   - Give "criteria.true" and "criteria.false"; put a common false positive into "false".
   - Avoid counting, dates, arithmetic, or questions that need information outside the window.
Use ids T1, T2, ...`;

const schema = {
  type: "object",
  properties: {
    context: { type: "string" },
    targets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          instructions: { type: "string" },
          criteria: {
            type: "object",
            properties: { true: { type: "string" }, false: { type: "string" } },
            required: ["true", "false"],
          },
        },
        required: ["id", "instructions", "criteria"],
      },
    },
  },
  required: ["context", "targets"],
};

const result = spawnSync(
  "claude",
  [
    "-p", prompt,
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--model", model,
    "--setting-sources", "project",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--permission-mode", "dontAsk",
    "--no-session-persistence",
  ],
  { cwd: join(caseDir, "snapshot"), encoding: "utf8", maxBuffer: 1 << 26 },
);
const out = JSON.parse(result.stdout) as { structured_output?: unknown; result?: string; total_cost_usd?: number; usage?: unknown };
const query = out.structured_output ?? JSON.parse(out.result ?? "{}");
writeFileSync(outPath, JSON.stringify(query, null, 2));
console.log(`wrote ${outPath} (cost ~$${out.total_cost_usd?.toFixed(4)} list price)`);
console.log(JSON.stringify(query, null, 2));
