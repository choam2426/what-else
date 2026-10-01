#!/usr/bin/env bash
# Runs one batch of the DeepSWE baseline (docs/records/baseline-deepswe.md) with Pier: tasks <from>..<to>
# (1-based, inclusive) of the fixed seed-0 order, plain Claude Code, CONCURRENT trials at a time (default 10).
#
# Usage: bench/deepswe-batch.sh <bench-dir> <from> <to> [job-name]
#   <bench-dir> holds deep-swe/ (cloned with core.autocrlf=false) and order-seed0.txt.
#   TASKS_FILE (relative to <bench-dir>) picks the task list instead of order-seed0.txt, for example
#   hard-set.txt; JOB sets the job name when no job-name argument is given. TASKS_DIR (relative to
#   <bench-dir>, default deep-swe/tasks) picks the task folder, and PIER_EXTRA adds pier options, for
#   example --disable-verification for the what-else setup tasks.
# Reads CLAUDE_CODE_OAUTH_TOKEN from the environment, or from the Windows user environment.
set -euo pipefail
bench=$1 from=$2 to=$3 job=${4:-${JOB:-baseline-sonnet55}} list=${TASKS_FILE:-order-seed0.txt}
model=anthropic/claude-sonnet-5-5 version=2.1.285 concurrent=${CONCURRENT:-10}

if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  CLAUDE_CODE_OAUTH_TOKEN=$(powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('CLAUDE_CODE_OAUTH_TOKEN','User')" | tr -d '\r\n')
  export CLAUDE_CODE_OAUTH_TOKEN
fi

cd "$bench"
include=()
while read -r task || [ -n "$task" ]; do include+=(-i "*$task"); done < <(sed -n "${from},${to}p" "$list")
echo "batch $from-$to of $list: $((${#include[@]} / 2)) tasks, job $job"
# shellcheck disable=SC2086
PYTHONIOENCODING=utf-8 pier run -p "${TASKS_DIR:-deep-swe/tasks}" "${include[@]}" ${PIER_EXTRA:-} -n "$concurrent" \
  --agent claude-code --model "$model" --ak version="$version" -o "jobs/$job"
