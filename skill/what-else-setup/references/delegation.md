# Delegating the search to a small-model worker

An option for a setup, when the user agrees to it. In the experiments it cost about 3× and took 4–6× as long as the plain agent for no gain beyond repository rules (see the method cards), so choose it for a reason the diagnosis gives, such as a repository too large for the main agent to search without filling its context.

## Roles

| Role | Knows | Does |
| --- | --- | --- |
| **Main agent** | the request, where the repository rules are | decides the change, writes the brief, waits for the worker's report, opens the places the report lists and makes the final call on each, then makes the whole change in one pass and adds notes for improving |
| **Worker** (small, fast model) | the scope method, the repository rules, the setup's search tools | turns the brief into searches, finds every place the planned change reaches, verifies and filters what it finds, and reports |

The worker does the broad search and filters it. The main agent looks only at what survived that filter, so its cost stays small while the final judgment stays with the stronger model. Where the harness has no subagents, the main agent plays both roles.

## Flow

1. **Decide the change.** For a new feature or a change of contract, this is the request itself. For a fix, diagnose until the faulty decision is known.
2. **Brief the worker**, from what the main agent knows at this point.
3. **Wait for the report.** Editing starts after it arrives.
4. **Review and decide.** Open the places the report lists, keep the ones that must change, and drop the rest with a reason.
5. **Make the change in one pass**, using the reviewed list as the plan.
6. **Check again only if the work turned out different from the brief**: brief the worker on the difference.
7. **Add notes** for improving.

**Small changes.** When the rules and one direct search show that a change touches a single place, the main agent states that search in one line and goes ahead without a brief.

## Brief

1. **Change**: what will change, before and after. For a fix, the faulty decision the diagnosis found.
2. **Known places**: places the main agent already knows must change. The worker confirms or disputes each.
3. **What to look for**: kinds of places easy to miss for this change, one line each, for example "the other database backends' feature flags" or "the release notes of the version under development". Point to the relevant repository rules.

The worker searches known names directly, and sends kinds of places that names do not pin down to the ranked search, scoped to the narrowest part of the repository the rules point to. Questions that share a scope go into one scan. When nothing a scan returns survives verification, the worker rewords the question or widens the scope one step, and records why.

## Report

The main agent reads the report with the stronger model, so it stays short. The format is yours to choose; it carries:

- **Places**, each with where it is (path relative to the repository root, and a line range in the file as it is now, or a note that content is to be added), an anchor that still finds it after earlier edits move the lines (a symbol name or a short quoted snippet), whether it is required or optional, its axis, and the reason. A place is required when the change is broken, wrong or inconsistent without it; each known place from the brief comes back confirmed or disputed.
- **Not checked**: areas the search could not cover, and why.
- **Axes**: for each axis that applies, what was searched and what was found, including "nothing"; then the axes that do not apply and why.

## Checks

- For a change that can reach beyond one place, the main agent briefs the worker before editing; for a small change it takes the small-change path.
- The worker runs on the small model, and the main agent leaves the searching to it until the report arrives.
- Every required or confirmed place in the report is in the final change, or the main agent says why not.
