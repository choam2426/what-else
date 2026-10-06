// Builds the DeepSWE task variants for the what-else arm (docs/records/baseline-deepswe.md, design step 3).
//
//   node bench/whatelse-tasks.mts setup <bench-dir> <tasks-file> <out-dir>
//     One setup task per (repository, base commit) among the tasks listed: the task's own image with a
//     copy of INSTALL.md and guide/ at /what-else, an instruction asking the agent to set up what-else
//     with the defaults, and a collect hook that saves everything the agent added or changed in /app
//     as /logs/artifacts/setup.patch. Run with verification disabled.
//
//   node bench/whatelse-tasks.mts variants <bench-dir> <tasks-file> <setup-jobs-dir> <out-dir>
//     The listed tasks unchanged, except that the image has the setup's patch applied to /app. Files
//     the setup added are listed in .git/info/exclude and files it changed are marked skip-worktree,
//     so the agent's commits, and so the graded patch, never carry the setup itself.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const [command, bench, tasksFile, ...rest] = process.argv.slice(2);

type Task = { id: string; dir: string; toml: string; repo: string; base: string; image: string };

function readTask(id: string): Task {
  const dir = join(bench!, "deep-swe", "tasks", id);
  const toml = readFileSync(join(dir, "task.toml"), "utf8");
  const field = (name: string) => toml.match(new RegExp(`^${name} = "([^"]+)"`, "m"))?.[1] ?? "";
  return { id, dir, toml, repo: field("repository_url"), base: field("base_commit_hash"), image: field("docker_image") };
}

// The slug names one setup: a repository at one base commit.
const slug = (t: Task) => `${t.repo.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${t.base.slice(0, 8)}`;

// Keeps the task's environment settings but builds from our Dockerfile on top of its image.
function withoutPrebuiltImage(toml: string) {
  return toml.replace(/^docker_image = .*\n/m, "");
}

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.replace(/\r\n/g, "\n"));
};

const setupInstruction = `Set up what-else for this project.

The what-else guide is at /what-else/INSTALL.md, a copy of https://github.com/choam2426/what-else; this environment has no internet access, so read it there. Nobody is available to answer questions during this setup, so take the defaults the guide describes for that case.

When you are done, report what you built, the choices you made, and what you could not check.
`;

function setup(outDir: string) {
  const tasks = readFileSync(tasksFile!, "utf8").trim().split("\n").map((l) => readTask(l.trim()));
  const seen = new Set<string>();
  for (const t of tasks) {
    const name = slug(t);
    if (seen.has(name)) continue;
    seen.add(name);
    const dir = join(outDir, name);
    rmSync(dir, { recursive: true, force: true });
    // The held-out tests stay out of the setup task; setup runs with verification disabled.
    cpSync(join(t.dir, "tests", "Dockerfile"), join(dir, "tests", "Dockerfile"));
    write(join(dir, "tests", "test.sh"), `#!/usr/bin/env bash\nmkdir -p /logs/verifier && echo '{"reward": 0}' > /logs/verifier/reward.json\n`);
    const collect = `cd /app && mkdir -p /logs/artifacts && git config --global --add safe.directory /app && git add -A && git diff --cached --binary ${t.base} > /logs/artifacts/setup.patch`;
    const toml = withoutPrebuiltImage(t.toml)
      .replace(/^artifacts = .*$/m, `artifacts = ["/logs/artifacts/setup.patch"]`)
      .replace(/^name = "datacurve\/.*"$/m, `name = "what-else-setup/${name}"`)
      .replace(/(\[\[verifier\.collect\]\]\ncommand = )".*"/, (_m, head: string) => `${head}${JSON.stringify(collect)}`);
    write(join(dir, "task.toml"), toml);
    write(join(dir, "instruction.md"), setupInstruction);
    write(join(dir, "environment", "Dockerfile"), `FROM ${t.image}\nCOPY what-else /what-else\n`);
    cpSync(join(repoRoot, "INSTALL.md"), join(dir, "environment", "what-else", "INSTALL.md"));
    cpSync(join(repoRoot, "guide"), join(dir, "environment", "what-else", "guide"), { recursive: true });
    console.log(`setup task ${name} (from ${t.id})`);
  }
}

function variants(setupJobs: string, outDir: string) {
  // The newest setup.patch per setup slug, found by the setup task name in each trial's result.json.
  const patches = new Map<string, string>();
  const trialDirs = readdirSync(setupJobs).flatMap((job) => {
    const jobDir = join(setupJobs, job);
    return statSync(jobDir).isDirectory() ? readdirSync(jobDir).map((n) => join(jobDir, n)).filter((d) => statSync(d).isDirectory()) : [];
  }).sort();
  for (const d of trialDirs) {
    const result = join(d, "result.json");
    const patch = join(d, "artifacts", "setup.patch");
    if (!existsSync(result) || !existsSync(patch)) continue;
    const name = (JSON.parse(readFileSync(result, "utf8")) as { task_name: string }).task_name.replace(/^what-else-setup\//, "");
    patches.set(name, patch);
  }
  const tasks = readFileSync(tasksFile!, "utf8").trim().split("\n").map((l) => readTask(l.trim()));
  for (const t of tasks) {
    const patch = patches.get(slug(t));
    if (!patch) {
      console.log(`SKIP ${t.id}: no setup.patch for ${slug(t)}`);
      continue;
    }
    const dir = join(outDir, t.id);
    rmSync(dir, { recursive: true, force: true });
    cpSync(t.dir, dir, { recursive: true });
    rmSync(join(dir, "environment"), { recursive: true, force: true });
    write(join(dir, "task.toml"), withoutPrebuiltImage(t.toml));
    // The arm is the setup's instructions, not changes to the code or build: keep the files the setup
    // created and its changes to agent instruction files, and drop its edits to existing project files
    // (one setup lowered a dependency version check to make the package import in its container).
    const sections = readFileSync(patch, "utf8").split(/(?=^diff --git )/m).filter(Boolean);
    const keep = (s: string) => {
      const path = s.match(/^diff --git a\/(\S+) b\//)?.[1] ?? "";
      return /^new file mode/m.test(s) || /^(CLAUDE|AGENTS)\.md$/.test(path) || path.startsWith(".claude/");
    };
    const dropped = sections.filter((s) => !keep(s)).map((s) => s.match(/^diff --git a\/(\S+)/)?.[1]);
    if (dropped.length) console.log(`  ${t.id}: dropped setup edits to ${dropped.join(", ")}`);
    write(join(dir, "environment", "setup.patch"), sections.filter(keep).join(""));
    // TOOL_DIR adds a fixed tool on top of the setup (see toolVariants), for a combined arm.
    const tool = process.env["TOOL_DIR"];
    if (tool) cpSync(tool, join(dir, "environment", "tool"), { recursive: true });
    write(join(dir, "environment", "Dockerfile"), [
      `FROM ${t.image}`,
      `COPY setup.patch /tmp/what-else-setup.patch`,
      ...(tool ? [`COPY tool /tmp/what-else-tool`] : []),
      // Added files are excluded and changed files skip-worktree, so the agent's commits leave the setup out.
      // A prebuilt image has stale index stat data, which --3way reports as "does not match index".
      `RUN cd /app && git update-index -q --refresh; git apply --3way --whitespace=nowarn /tmp/what-else-setup.patch \\`,
      ` && git reset -q \\`,
      ...(tool ? [
        ` && find /tmp/what-else-tool -mindepth 1 -maxdepth 1 ! -name CLAUDE.append.md -exec cp -r {} /app/ \\; \\`,
        ` && cat /tmp/what-else-tool/CLAUDE.append.md >> CLAUDE.md && rm -rf /tmp/what-else-tool \\`,
      ] : []),
      ` && git ls-files --others --exclude-standard >> .git/info/exclude \\`,
      ` && (git diff --name-only | xargs -r git update-index --skip-worktree) \\`,
      ` && rm /tmp/what-else-setup.patch`,
      ``,
    ].join("\n"));
    console.log(`variant ${t.id} <- ${slug(t)} (${statSync(patch).size} bytes)`);
  }
}

// A fixed tool instead of a setup: the files under <tool-dir> (except CLAUDE.append.md) are copied
// into /app, and CLAUDE.append.md is appended to /app/CLAUDE.md. Same exclusions as the variants.
function toolVariants(toolDir: string, outDir: string) {
  const tasks = readFileSync(tasksFile!, "utf8").trim().split("\n").map((l) => readTask(l.trim()));
  for (const t of tasks) {
    const dir = join(outDir, t.id);
    rmSync(dir, { recursive: true, force: true });
    cpSync(t.dir, dir, { recursive: true });
    rmSync(join(dir, "environment"), { recursive: true, force: true });
    write(join(dir, "task.toml"), withoutPrebuiltImage(t.toml));
    cpSync(toolDir, join(dir, "environment", "tool"), { recursive: true });
    write(join(dir, "environment", "Dockerfile"), [
      `FROM ${t.image}`,
      `COPY tool /tmp/what-else-tool`,
      `RUN cd /app && git update-index -q --refresh; \\`,
      `    find /tmp/what-else-tool -mindepth 1 -maxdepth 1 ! -name CLAUDE.append.md -exec cp -r {} /app/ \\; \\`,
      ` && cat /tmp/what-else-tool/CLAUDE.append.md >> CLAUDE.md \\`,
      ` && git ls-files --others --exclude-standard >> .git/info/exclude \\`,
      ` && (git diff --name-only | xargs -r git update-index --skip-worktree) \\`,
      ` && rm -rf /tmp/what-else-tool`,
      ``,
    ].join("\n"));
    console.log(`tool variant ${t.id}`);
  }
}

if (command === "setup" && bench && tasksFile && rest[0]) setup(rest[0]);
else if (command === "tool-variants" && bench && tasksFile && rest[0] && rest[1]) toolVariants(rest[0], rest[1]);
else if (command === "variants" && bench && tasksFile && rest[0] && rest[1]) variants(rest[0], rest[1]);
else {
  console.error("usage: node bench/whatelse-tasks.mts setup <bench-dir> <tasks-file> <out-dir> | variants <bench-dir> <tasks-file> <setup-jobs-dir> <out-dir>");
  process.exit(2);
}
