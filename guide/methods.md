# Method cards

What earlier experiments found about each approach. Use them to build the proposal, and compare the conditions each result was measured in with the project at hand before leaning on it.

**Conditions of every result below, unless a card says otherwise:** Claude Code on Windows, main model Sonnet 5 (worker Haiku 4.5), 2026-09-28 to 09-30. Results marked *DeepSWE* come from Claude Code with Sonnet 5.5 inside Linux containers, 2026-10-02 to 10-07, on a scope set of 14 DeepSWE tasks in 14 repositories (Python, TypeScript, JavaScript, Go, Rust) where the plain agent had repeatedly missed places, mostly a second code path or a sibling implementation. There, each method ran twice per task, and blind judges saw all methods' changes for a task side by side and counted scope misses against each change's own design. A result from one harness, one model generation and a handful of repositories is a starting point for the project's own verification, not a verdict.

**Evidence strength:** *strong* means consistent across several repositories and repeated runs; *moderate* means repeated runs in one repository, or single runs agreeing across several; *weak* means one run in one repository, or a difference within run-to-run variance; *not measured* means nobody has tried it yet.

Each card carries the conditions needed to judge it. The full experiment records, with their design, variance and known flaws, are at https://github.com/choam2426/what-else/tree/main/docs/records for anyone who wants to look deeper.

---

## Leaving things as they are

- **What:** the plain harness, with whatever instructions the repository already has.
- **Enough when:** the plain agent already finds nearly every place. On SWE-bench Pro tasks in ansible (Python) and teleport (Go), it missed 2 required files over 7 tasks, and rules changed nothing.
- **Not enough when:** conventions call for files the change itself never mentions. On Django, one plain run missed required files in 6 of 16 changes; many of those places were one search away, and the agent had not looked there. A second plain run found half of those files, so single runs overstate what is missed.
- **Evidence:** weak.

## A check step before finishing

- **What:** one paragraph in the always-loaded instructions, and nothing else. It asks the agent, before it finishes a change, to check the places the change may also have to reach, open the likely ones, decide for each, and say in its summary which it checked. The text measured:

  > Before finishing a change, check whether it must also reach other places in this project: another implementation of the same thing, another path that makes the same decision, a list or registry the new thing belongs in, callers that depend on changed behavior, and declared types or schemas. Open the likely places and decide for each whether it needs the same change. In your summary, say which you checked.

- **Helped when (DeepSWE):** scope misses over 28 runs fell from 16 with the plain agent to 10. That matched or beat every other method judged alongside it: BM25 tool 10.5, repository rules 12.5, rules plus BM25 12.5. In one run each, it covered a second code path in numba and a sibling in onedump that the rules and BM25 runs missed.
- **Did not reach:** places that need knowledge the agent does not have. A terminal flag in textual's drivers was found only once, by the BM25 tool. Convention files, such as release notes, were not part of this measurement; on Django, repository rules fixed those.
- **Cost:** a paragraph of instructions; no setup and no tool.
- **Use it as:** the base of every setup, together with the second look below. Add rules or a search tool on top only for misses these leave, and check the addition on those misses.
- **Evidence:** weak to moderate. One benchmark, 14 tasks × 2 runs, two judges agreeing on 85% of verdicts; in the second round the gaps between methods were small.

## A second look with an acceptance rule

- **What:** added after the check step, in the same always-loaded instructions. Before finishing, the agent has a subagent with none of its context take a second look: the subagent gets only the original request, reads the change itself with `git diff`, explores the code, and reports places the change must also reach and does not, each with one sentence on what breaks if it is left as it is. The agent then fixes every reported place whose sentence holds up when it reads the code, including places the request does not name, and says what it found where a sentence does not hold up. The text measured, placed after the check step:

  > Whoever designed a change tends to look where the design already points, so the places it misses are the ones that design never brings to mind. After your own check, and before you finish, have a subagent take that second look with none of your context.
  >
  > Give the subagent only the original request, word for word, and tell it to read the change itself with `git diff` (and `git status` for new files) and to explore the code as it sees fit. Ask it to find places this change must also reach and does not: another implementation of the same thing, another path that makes the same decision, a list or registry, callers that depend on changed behavior, declared types or schemas, and anything else the change implies. For each place it reports, ask for the file and symbol and one sentence on what breaks or stays wrong if it is left as it is. Leave your own reasoning and the list of places you checked out of the brief, so it looks on its own.
  >
  > Then judge each place it reports by one test: does its sentence about what breaks or stays wrong hold up when you read the code? Where it holds up, make the change, including in places the request does not name. A request describes the behavior wanted; the places that behavior has to reach are for you to find, so a sibling, a second path or a caller the request leaves unnamed is still in scope. Where the sentence does not hold up, say what you found in the code that shows it. Changing a signature that other code calls means updating those callers too, which is part of the same change.
  >
  > In your summary, say what the second look reported and what you did with each.

- **Why both parts:** whoever designed a change looks where the design points, so a second look without that context finds other places. Without the acceptance rule, the agent turned those findings down as outside the request ("the request names only direct and topic", "changing the signature would break callers"), and the result equalled the check step alone (5 against 5.5 of 14).
- **Helped when (DeepSWE):** scope misses over 28 runs: plain 15.5, check step alone 11, check step with the second look and the acceptance rule 6. It fixed places other methods had rarely or never fixed: a sibling transport's fanout path in kombu (never before), the terminal flags in all three textual drivers (once before, by BM25), a legacy path in obsidian.
- **Did not reach:** a capability the change needed in another provider (claude-code-by-agents), missed by every method; the agent noted the gap in its summary and left it.
- **Cost:** one subagent run per change. Changes beyond the request with no good reason stayed about the same as with the check step alone (4 against 3 of 14); justified ones, such as documenting a new option, rose, which is acceptable.
- **Evidence:** moderate. One benchmark, 14 tasks × 2 runs, the same two judges seeing all methods of a task, agreeing on 88% and 90% of verdicts.

## Repository rules with a checklist line

- **What:** rules about what the project changes together ([rules.md](rules.md)), in the always-loaded instructions, plus one line asking the agent to check the places they point to before finishing. No other tools.
- **Helped when:** conventions are strong and regular.
  - Django, 12 held-out changes described by their original tickets, rules written before any tuning: real misses 7 → 3, changes with no real miss 6/12 → 10/12.
  - Dev set, 10 changes (Django 6, pydantic 4): real misses 20 → 5. The requests there were commit messages and the rules had been tuned on the dev set, so this number is likely inflated.
- **Fixed:** mostly convention files: release notes, patch release notes, reference docs.
- **On code paths (DeepSWE):** rules written by an agent for each repository with no user to answer, plus the checklist line: scope misses 18 → 11 over 28 runs in one judging, 16 → 12.5 in another. The check step alone did as well (10), so on this kind of miss the rules added nothing measurable beyond the checklist line.
- **Did not help when:** the plain agent already missed almost nothing.
- **Cost:** about +$0.09 and +20 s per change on Django (from $0.09 to $0.18); +$0.05 on SWE-bench Pro.
- **Watch for:** rules copied from specific past commits instead of kinds of change; long rules loaded into every session.
- **Evidence:** weak. The held-out result is one repository and one run per case, with 4 cases better and 1 worse; the tuned dev set points the same way.

## Scope method as a prompt addition

- **What:** the axes in [scope-method.md](scope-method.md) added to the agent's instructions, without repository rules.
- **Result:** on 16 Django changes, files found 73/87 against 72/87 and 69/87 for two plain runs; wrong candidates rose. No gain beyond variance. There the request itself already asked the agent to find every place that changes together, so a method for doing so had little to add. With ordinary requests, the short check step above did reduce misses.
- **Use it as:** the checklist behind the check step, the rules and a delegated search, rather than as a long addition on its own.
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
- **As the agent's tool (DeepSWE):** a local BM25 script over the files git tracks, run once before finishing with a description of the change, with the instruction to open each listed file not yet changed. Scope misses 18 → 10 over 28 runs in one judging, 16 → 10.5 in another, about the same as the check step alone (10). It once found a place nothing else did (textual's terminal drivers). Combined with repository rules it did no better than either alone.
- **Fits:** misses that share words with the change, and preselecting candidates for a slower backend.
- **Evidence:** weak.

### Semantic ranking (dense retrieval)

- **What:** ranks by similarity of meaning, with an embedding index. Local models keep code on the machine; embedding services send it out. The index needs updating as the code changes.
- **Evidence:** not measured.

### Jev (TypeSafe AI's fast classifier)

- **What:** answers yes/no questions about one piece of code at a time ([docs](https://docs.typesafe.ai), index for agents at https://docs.typesafe.ai/llms.txt). One request can carry several questions about the same piece, and each extra question adds only a few tokens. When measured, it cost $0.042 per million input tokens, with a limit of 20 requests per second. Code leaves the machine.
- **Helped when:** used broadly, as a ranker. It had the best top-10 recall of all backends measured, 46/53; 12 of the 16 files the plain agent had missed were in its top 10. Its precision was about 28%, so it serves as a ranked list rather than an answer. Given as a top-15 list to a plain agent in a controlled setting (the first edit already applied, then "finish this change"), it raised required-file coverage on 10 changes from 70% to 80% at the same cost and time.
- **Offered, not required (DeepSWE):** with the check step, a short guide to Jev and a key in the environment, the agent used Jev in 1 of 14 tasks; the others judged their few candidates quicker to read directly. Scope misses matched the check step alone (5 against 4.5 of 14). Saying what it is for (finding places the agent has not thought of, over the area the change could reach) raised use to 3 of 14 tasks and led the agent to open files it had not considered; one of them was in scope and missed by a plain run, but runs with the check step alone did not miss it either (6 against 5 of 14 overall). On this kind of task, Jev added nothing measurable beyond the check step.
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
