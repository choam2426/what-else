# How to find the full scope of a change

Most missed places are places nobody looked. Look everywhere this change can reach, starting from the repository rules, and keep track of what you checked.

Whoever does the search follows this: the main agent itself, or a worker it delegates to ([delegation.md](delegation.md)). Added in full to the instructions of a strong model whose request already asked it to find every place, this method did not measurably reduce misses. A short check step before finishing, naming the axes below in one paragraph, did reduce them with ordinary requests (see the method cards). Its value is as the checklist behind that step, the repository rules and a delegated search.

## 1. Write down what the change changes

List each contract the change touches. For example:

- a name, signature, or parameter
- behavior: return values, raised errors, accepted inputs, side effects
- data shape: fields, formats, serialized output
- supported range: versions, platforms, backends, or options that are added or dropped
- public surface: something new, deprecated, or removed

## 2. Go through the axes that apply to each contract change

- **A. Uses.** Every place that refers to what changes: calls, imports, subclasses, overrides, and indirect references (string names, config keys, registries, reflection). For a behavior change, ask of each caller whether it depends on the old behavior, for example an error that is no longer raised.
- **B. Parallels.** Code that does the same thing and must stay consistent: other parts of the same file, other implementations of the same interface (backends, drivers, platforms), and siblings with the same role, including siblings the request does not name.
- **C. Same decision, other path.** The same rule applied from another entry point: sync and async, single and bulk, create and update, server and client, one validation layer and another.
- **D. Boundaries.** Serializers, schemas, type declarations, API specs, migrations, setting defaults, CLI flags, environment variables.
- **E. Repository conventions.** Files the project updates for this kind of change: release notes or changelog, reference docs, deprecation notes, version or support tables. Start from the conventions in the repository rules, and turn to history for kinds of change the rules leave out.
- **F. Tests.** Existing tests whose expectations change. New tests are optional.
- **G. No longer needed.** Workarounds, compatibility branches, and comments that the change makes obsolete. These are optional.

## 3. Search the fastest way that can find it

Search for known names, strings, error messages and version numbers directly. For kinds of places that names do not pin down, use the ranked search the setup provides, if any. When a search comes back empty where something should be, try another way before concluding there is nothing.

## 4. Verify each candidate

Keep a place when you can say in one sentence what breaks or becomes wrong if it stays unchanged; mark it optional when the change works without it; drop it otherwise.

## 5. Before finishing

For each axis that applies, you can say what you searched and what you found, including "nothing". Areas you could not check are named as such.
