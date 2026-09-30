# Diagnosis

The diagnosis answers three questions about the project, from its own history and structure:

1. Do changes here miss places at all?
2. Which kinds of places get missed?
3. How costly are those misses?

The answers decide the proposal. A repository where changes rarely miss anything needs little or nothing. A repository whose misses are convention files needs rules. A repository whose misses are places that share no name with the change may need a search tool that ranks by meaning; verify that it helps there, since the measured gain from one vanished once repository rules were in place.

## Miss events in the history

The strongest evidence is a **miss event**: a later commit that completes an earlier change, because the earlier change missed a place. Examples:

- a follow-up that adds the release note, the reference doc or the changelog entry the earlier change needed
- a follow-up that applies the same change to a sibling: another backend, another command, another platform
- a follow-up that fixes a caller left behind by a behavior change
- a fixup commit, or a revert followed by a fuller reapply
- a review comment asking for the same change somewhere else

Typical signals are commit messages such as "also", "forgot", "missing", "follow-up to", a shared issue or ticket number, and a small commit shortly after an earlier one that touches files the earlier one usually changes together with.

For each miss event, record the original change, the place it missed, the kind of place (the axes in [scope-method.md](scope-method.md)), and how the miss surfaced: caught by tests or review, or shipped and fixed later. Misses that shipped and misses in logic cost more than misses in documentation; keep that distinction, since it decides what the setup is worth here.

Deciding whether a commit is a miss event is a yes/no question per commit. Over thousands of commits, a fast, cheap classifier such as Jev or a small model can answer it; read a sample of what it keeps to confirm. This way of mining history has not been measured yet; treat the first run in a repository as a trial and report how well it worked.

Miss events also serve twice more: they point to the rules to write ([rules.md](rules.md)), and they are the test cases for verification ([verification.md](verification.md)).

## What else to look at

- **What changes together.** Files that many commits touch together, per kind of change: a new public API, a behavior change, a bug fix in a released version, a deprecation, dropped support. Strong, regular conventions are what rules capture best.
- **How far names reach.** For the miss events found, whether the missed place shares a name, string, message or version number with the change. Places that share one are found by direct search once the agent knows to look; places that share none need a ranked search.
- **Size and shape.** Languages, a monorepo, generated code, boundaries between languages or services, how much of the repository fits in one agent's context.
- **What is already in place.** Existing agent instructions and conventions files, language servers, code search, indexes. An existing, well-tuned harness may already cover most of this.
- **Constraints.** Whether code may leave the machine, whether secrets live in the tree, and what spending and waiting per change is acceptable. These go to the user in the agreement step.

## What the diagnosis leads to

| Finding | Leads toward |
| --- | --- |
| Few miss events, and the plain agent already finds nearly everything | Leaving things as they are, or rules only |
| Misses are mostly convention files | Repository rules with a checklist line |
| Misses share names with the change, and the agent did not look there | Rules and the scope method as a checklist |
| Misses share words, but not exact names, with the change | Lexical ranking |
| Misses share no words with the change | A ranked search that ranks by meaning, such as Jev or semantic search, verified on the project |
| The repository is too large for the main agent to search without filling its context | Delegating the search to a small model |
