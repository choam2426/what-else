# Repository rules

Repository rules say what the project changes together. They carry knowledge the code does not show and a stronger model does not bring: the project's own conventions. They work by directing attention, telling the agent where to look for this kind of change, rather than by searching for it.

## What the rules answer

- **Conventions (axis E)**: for each kind of change (new public API, behavior change, bug fix in a released version, deprecation, dropping support), which files are also updated, and how to tell which one applies, such as which release notes file belongs to the version under development.
- **Siblings (axis B)**: groups of files with the same role, where a change to one usually needs the same change in the others.
- **Same decision in more than one place (axis C)**: rules implemented more than once, reached from different entry points.
- **Boundaries (axis D)**: contracts declared outside the implementation, such as type declarations, schemas, settings references, checks and public API docs, and which changes require updating them.

Write them about kinds of changes, so they hold for changes nobody has made yet. Learn them from what the repository actually does: its contributing guide, the files its commits change together, and the miss events found in the diagnosis.

## Where they go

Link the rules from the project instructions the harness always loads, with one line asking the agent to check the places the rules point to before it finishes a change.

Write the rules, and anything else you add to the project's instructions, as what to do. Keep prohibitions for a mistake agents keep repeating in this project, or for something that must never happen, such as sending secrets out.

- **Measured:** the full rules in the always-loaded instructions, plus that one line. This is what cut misses in the experiments (see the method cards).
- **Not measured yet:** only a pointer and the kinds of change the rules cover in the always-loaded instructions, with the full rules in a separate file. This keeps ordinary sessions lighter when the rules are long; verify it before relying on it.

## Keeping them right

After a change, the agent notes places that had to change and the rules did not point to, and rules that pointed nowhere or misled. When notes accumulate, fold them into the rules as upkeep separate from any change.
