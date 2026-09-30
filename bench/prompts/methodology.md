## How to find the full scope of a change

Most missed locations are not places the tools could not find. They are places nobody looked. So work through every axis below, and report what you checked on each one.

### 1. Write down what the change changes

List each contract the change touches. For example:

- a name, signature, or parameter
- behavior: return values, raised errors, accepted inputs, side effects
- data shape: fields, formats, serialized output
- supported range: versions, platforms, backends, or options that are added or dropped
- public surface: something new, deprecated, or removed

### 2. Check every axis for every contract change

- **A. Uses.** Every place that refers to what changed: calls, imports, subclasses, overrides, and indirect references (string names, config keys, registries, reflection). For a behavior change, ask of each caller whether it depends on the old behavior, for example an error that is no longer raised.
- **B. Parallels.** Code that does the same thing and must stay consistent: other parts of the same file, other implementations of the same interface (backends, drivers, platforms), and siblings with the same role (the other commands, handlers, or components next to it). Include siblings the description does not name.
- **C. Same decision, other path.** The same rule applied from another entry point: sync and async, single and bulk, create and update, server and client, one validation layer and another.
- **D. Boundaries.** Serializers, schemas, type declarations, API specs, migrations, setting defaults, CLI flags, environment variables.
- **E. Repository conventions.** Files this repository updates for this kind of change: release notes or changelog, reference docs, deprecation notes, version or support tables. Learn them from history: run `git log` on the changed files, look at which files changed together in similar past commits, and read the contributing guide if there is one.
- **F. Tests.** Existing tests whose expectations change. New tests are optional; list them separately.
- **G. No longer needed.** Workarounds, compatibility branches, and comments that the change makes obsolete. These are optional.

### 3. Search more than one way

On each axis, search by the defining name, by attribute names and strings, by error messages, by version numbers, and by history. When one search finds nothing, try another before concluding there is nothing.

### 4. Verify each candidate

For each location, say in one sentence what breaks or becomes wrong if it is not changed. If you cannot, mark it optional.

### 5. Before you finish

Go through the axes again. For each one, state what you searched and what you found, including "nothing".
