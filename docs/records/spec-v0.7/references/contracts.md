# Roles, contracts and checks

## Roles

| Role | Knows | Does |
| --- | --- | --- |
| **Main agent** | the request, where the repository rules are | decides the change, writes the brief, waits for the worker's report, opens the places the report lists and makes the final call on each, then makes the whole change in one pass and adds notes for improving |
| **Worker** (small, fast model) | the method, the repository rules, JevGrep | turns the brief into searches, finds every place the planned change reaches, verifies and filters what it finds, and reports |
| **Jev** | one piece of the repository at a time | answers yes/no questions about that piece |

The worker does the broad search and filters it. The main agent looks only at what survived that filter, so its cost stays small while the final judgment stays with the stronger model.

## Flow

1. **Decide the change.** For a new feature or a change of contract, this is the request itself. For a fix, diagnose until the faulty decision is known.
2. **Brief the worker**, from what the main agent knows at this point.
3. **Wait for the report.** Editing starts after it arrives, and the work finishes only after every task the main agent started is done.
4. **Review and decide.** Open the places the report lists, keep the ones that must change, and drop the rest with a reason.
5. **Make the change in one pass**, using the reviewed list as the plan.
6. **Check again only if the work turned out different from the brief**: brief the worker on the difference.
7. **Add notes** for improving (see [Improving](#improving)).

**Small changes.** When the rules and one direct search show that a change touches a single place, the main agent states that search in one line and goes ahead without a brief.

## Brief

What the main agent hands to the worker. It is written from what the main agent already knows; the worker does the searching.

1. **Change**: what will change, before and after. For a fix, the faulty decision the diagnosis found.
2. **Known places**: places the main agent already knows must change. The worker confirms or disputes each.
3. **What to look for**: kinds of places easy to miss for this change, one line each, for example "the other database backends' feature flags" or "the release notes of the version under development". Point to the relevant repository rules.

The worker turns each line into searches. Known names, strings, messages and versions are searched for directly. Kinds of places that names do not pin down go to JevGrep, as a question answerable from one piece alone, scoped to the narrowest part of the repository the rules point to.

Questions that share a scope go into one scan, since asking several questions about the same pieces costs about as much as asking one. The worker scans narrow first, since a narrow scan is fast and cheap. A question misses when none of its results survive verification; the worker then rewords it, or widens its scope one step, and records where it widened and why. Wording that works well in this repository is kept in the implementation for the next change.

## Report

What the worker hands back to the main agent. It stays short, because the main agent reads it with the stronger model.

**Places**, one line each:

```
<path>:<start>-<end> <anchor> | required | <axis> | <what breaks or becomes wrong if it stays unchanged>
<path>:new <anchor> | optional | <axis> | <reason>
<path>:<start>-<end> <anchor> | known: confirmed | <axis> | <reason>
```

- The path is relative to the repository root. The range is in the file as it is now, before the change; `new` marks content to add where no range fits. The anchor is a symbol name or a short quoted snippet, so the place can still be found after earlier edits move the lines.
- `required`: the change is broken, wrong or inconsistent without it. Everything else is `optional`. Each known place from the brief appears as `known: confirmed` or `known: disputed`.

**Not checked**, one line each: `<area> | <reason>`, for scans stopped by a limit, requests that failed, or results that were cut.

**Axes**, one line each: for each axis of the method that applies, what was searched and what was found, including "nothing"; then the axes that do not apply and why.

The full record, including every JevGrep question, rewording and widening, goes into the run record rather than the report.

## Rules

The repository rules answer, for this repository:

- **Conventions (axis E)**: for each kind of change (new public API, behavior change, bug fix in a released version, deprecation, dropping support), which files are also updated and how to tell which one applies.
- **Siblings (axis B)**: groups of files with the same role, where a change to one usually needs the same change in the others.
- **Same decision in more than one place (axis C)**: rules implemented more than once, reached from different entry points.
- **Boundaries (axis D)**: contracts declared outside the implementation, such as type declarations, schemas, settings references, checks and public API docs, and which changes require updating them.

Write them about kinds of changes, so they hold for changes nobody has made yet. The worker loads the full rules. The project instructions the harness always loads carry only a pointer to them and the kinds of change they cover, so ordinary sessions stay light.

## Improving

Each change leaves a run record with the brief, the report, the JevGrep runs and the notes.

The notes are the entry point's last step, written by the main agent right after the change:

- places that had to change and the report missed, and which axis or rule would have found them
- places the report listed that turned out not to need a change
- rules that pointed nowhere or misled
- JevGrep runs that were blocked, scanned far more than needed, or brought back nothing useful, and the wording that worked instead

When notes accumulate, fold them into the rules, the question wording, JevGrep and the entry point's description, as upkeep separate from any change. These parts belong to the implementation and improve in the repository. A problem in the roles, the brief or the report themselves is recorded as feedback on this specification, and the contracts stay as written until the specification changes.

## Checks

| # | Check | When it can be checked |
| --- | --- | --- |
| C1 | JevGrep answers a real question on this repository, returns candidates with path and line range, reports the unchecked parts, and records the run | setup |
| C2 | For a change that can reach beyond one place, the main agent uses the entry point before editing; for a small change it takes the small-change path | a trial change, and in use |
| C3 | The main agent hands the search to the worker, and the worker runs on the small model | a trial change, and in use |
| C4 | Between handing over the brief and receiving the report, the main agent leaves all searching to the worker | a trial change, and in use |
| C5 | The brief follows the brief contract | a trial change, and in use |
| C6 | The worker scans narrow first, rewords or widens only after a miss, and records each widening | a trial change, and in use |
| C7 | The report follows the report contract, including what was not checked | a trial change, and in use |
| C8 | Every required or confirmed place in the report is in the final change, or the main agent says why not | in use |

At setup, run one trial change in a fresh session of the harness: a plain request for a small real change, waiting for every task it starts, and leaving the working tree as it found it. A check that fails in use is a finding: improve the implementation part it points to, or record it as feedback on this specification.
