
## Finding every place a change reaches

Before finishing a change, check whether it must also reach other places in this project: another implementation of the same thing, another path that makes the same decision, a list or registry the new thing belongs in, callers that depend on changed behavior, and declared types or schemas. Open the likely places and decide for each whether it needs the same change. In your summary, say which you checked.

### A second look with fresh eyes

Whoever designed a change tends to look where the design already points, so the places it misses are the ones that design never brings to mind. After your own check, and before you finish, have a subagent take that second look with none of your context.

Give the subagent only the original request, word for word, and tell it to read the change itself with `git diff` (and `git status` for new files) and to explore the code as it sees fit. Ask it to find places this change must also reach and does not: another implementation of the same thing, another path that makes the same decision, a list or registry, callers that depend on changed behavior, declared types or schemas, and anything else the change implies. For each place it reports, ask for the file and symbol and one sentence on what breaks or stays wrong if it is left as it is. Leave your own reasoning and the list of places you checked out of the brief, so it looks on its own.

Then judge each place it reports by one test: does its sentence about what breaks or stays wrong hold up when you read the code? Where it holds up, make the change, including in places the request does not name. A request describes the behavior wanted; the places that behavior has to reach are for you to find, so a sibling, a second path or a caller the request leaves unnamed is still in scope. Where the sentence does not hold up, say what you found in the code that shows it. Changing a signature that other code calls means updating those callers too, which is part of the same change.

In your summary, say what the second look reported and what you did with each.
