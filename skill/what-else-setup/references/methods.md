# Method cards

What earlier experiments found about each approach. Use them to build the proposal, and compare the conditions each result was measured in with the repository at hand before leaning on it.

**Conditions of every result below, unless a card says otherwise:** Claude Code on Windows, main model Sonnet 5 (worker Haiku 4.5), 2026-09-28 to 09-30. A result from one harness, one model generation and a handful of repositories is a starting point for this repository's own verification, not a verdict.

**Evidence strength:** *strong* means consistent across several repositories and repeated runs; *moderate* means repeated runs in one repository, or single runs agreeing across several; *weak* means one run in one repository, or a difference within run-to-run variance; *not measured* means nobody has tried it yet.

Each card carries the conditions needed to judge it. The full experiment records, with their design, variance and known flaws, are at https://github.com/choam2426/what-else/tree/main/docs/records for anyone who wants to look deeper.

---

## Leaving things as they are

- **What:** the plain harness, with whatever instructions the repository already has.
- **Enough when:** the plain agent already finds nearly every place. On SWE-bench Pro tasks in ansible (Python) and teleport (Go), it missed 2 required files over 7 tasks, and rules changed nothing.
- **Not enough when:** conventions call for files the change itself never mentions. On Django, one plain run missed required files in 6 of 16 changes; many of those places were one search away, and the agent had not looked there. A second plain run found half of those files, so single runs overstate what is missed.
- **Evidence:** weak.

## Repository rules with a checklist line

- **What:** rules about what this repository changes together ([rules.md](rules.md)), in the always-loaded instructions, plus one line asking the agent to check the places they point to before finishing. No other tools.
- **Helped when:** conventions are strong and regular.
  - Django, 12 held-out changes described by their original tickets, rules written before any tuning: real misses 7 → 3, changes with no real miss 6/12 → 10/12.
  - Dev set, 10 changes (Django 6, pydantic 4): real misses 20 → 5. The requests there were commit messages and the rules had been tuned on the dev set, so this number is likely inflated.
- **Fixed:** mostly convention files: release notes, patch release notes, reference docs.
- **Did not help when:** the plain agent already missed almost nothing.
- **Cost:** about +$0.09 and +20 s per change on Django (from $0.09 to $0.18); +$0.05 on SWE-bench Pro.
- **Watch for:** rules copied from specific past commits instead of kinds of change; long rules loaded into every session.
- **Evidence:** weak. The held-out result is one repository and one run per case, with 4 cases better and 1 worse; the tuned dev set points the same way.

## Scope method as a prompt addition

- **What:** the axes in [scope-method.md](scope-method.md) added to the agent's instructions, without repository rules.
- **Result:** on 16 Django changes, files found 73/87 against 72/87 and 69/87 for two plain runs; wrong candidates rose. No gain beyond variance.
- **Use it as:** the checklist behind the rules and behind a delegated search, rather than on its own.
- **Evidence:** weak.

## Small model with the scope method and rules

- **What:** a small model (Haiku) with the scope method and repository rules does the search that a large model would otherwise do alone.
- **Result:** it closes much of the gap to the large model in some repositories and none in others.
  - Django: 77% of files against Sonnet 81% and plain Haiku 57%, for 58% of Sonnet's cost.
  - pydantic, required files: 64% against Sonnet 82% and plain Haiku 39%.
  - outline (TypeScript): 62% against plain Haiku 71%. Here the method and rules made it worse.
- **Evidence:** weak.

## Delegating the search to a small-model worker

- **What:** the main agent decides the change, briefs a small-model worker, the worker searches and filters, and the main agent reviews only the survivors and edits in one pass ([delegation.md](delegation.md)).
- **Result:** built from a spec by the agent itself in six repositories. It cost about 3× and took 4–6× as long as the plain agent, and it found no more than rules alone. The main agent often judged a change small and skipped the worker.
- **Consider it when:** the repository is too large for the main agent to search without filling its context, or the main model is much more expensive than the worker. Neither case has been measured.
- **Evidence:** weak.

## Ranked search, any backend

A ranked search takes a description of the change and returns the places most likely to need a change, ranked. It covers places that share no name with the change, which direct search cannot reach.

Whatever the backend, a ranked search in a setup:

- returns ranked places, each with its path and line range
- reports the parts it left unchecked
- records each run: the question, where it looked, what came back, and what it cost
- sends only files the repository tracks, and leaves secrets out, when it sends code to a service

Measured as a ranker over whole areas with one question containing the change description, on 18 dev changes (Django 16, pydantic 2) with 53 required files. The table shows how many of 53 required files appeared in each backend's top 10:

| Backend | Required files in top 10 |
| --- | --- |
| Jev | 46 |
| BM25 | 27 |
| grep | 21 |

### Lexical ranking (BM25 and similar)

- **What:** ranks by shared words. Local, free, fast.
- **Result:** top-10 recall 27/53. In a simulation on one Django change, preselecting 1,000 candidates with it for a slower classifier kept 11 of 12 files in an estimated 50 s. That worked because every file shared a term with the change ("PostgreSQL", a version number).
- **Fits:** misses that share words with the change, and preselecting candidates for a slower backend.
- **Evidence:** weak.

### Semantic ranking (dense retrieval)

- **What:** ranks by similarity of meaning, with an embedding index. Local models keep code on the machine; embedding services send it out. The index needs updating as the code changes.
- **Evidence:** not measured.

### Jev (TypeSafe AI's fast classifier)

- **What:** answers yes/no questions about one piece of code at a time ([docs](https://docs.typesafe.ai), index for agents at https://docs.typesafe.ai/llms.txt). One request can carry several questions about the same piece, and each extra question adds only a few tokens. When measured, it cost $0.042 per million input tokens, with a limit of 20 requests per second. Code leaves the machine.
- **Helped when:** used broadly, as a ranker. It had the best top-10 recall of all backends measured, 46/53; 12 of the 16 files the plain agent had missed were in its top 10. Its precision was about 28%, so it serves as a ranked list rather than an answer. Given as a top-15 list to a plain agent in a controlled setting (the first edit already applied, then "finish this change"), it raised required-file coverage on 10 changes from 70% to 80% at the same cost and time.
- **Did not help when:**
  - Repository rules were already present: on the same 10 dev changes, real misses were 5 with rules alone and 6 with rules plus the Jev list.
  - Used narrowly, with specific questions written by the agent per scope: the same setup with and without Jev gave the same result in 11 of 12 pairs and a worse one in 1.
  - Scanning was mandatory: it made a small model worse in all three repositories tried.
- **Watch for:**
  - A full scan of a large repository is slow: 783 s for 15,673 pieces on Django. Preselect candidates.
  - Agent-written scans can multiply requests into the thousands per change. Keep scans narrow by default, and put the questions for the same pieces into one request.
- **Evidence:** weak.

### Static references (language servers, ctags)

- **What:** exact references by name: calls, imports, overrides.
- **Fits:** axis A, when names reach the places. It does not reach places that share no name with the change.
- **Evidence:** not measured.
