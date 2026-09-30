## How to work

You have a subagent, `change-scope-worker`, that runs a smaller and cheaper model. It knows a method for finding the full scope of a change and the rules of this repository, and it does all the reading and searching. Your part is the brief and the final list, which keeps your cost small.

1. Right away, write the brief from what you know about the change and the rules above, and hand it to `change-scope-worker` once:
   - what changed, before and after
   - places you already know must change
   - where it should look that is easy to miss: kinds of places such as siblings with the same role, other paths that apply the same decision, boundaries, repository conventions
{{BRIEF_EXTRA}}
2. Give its report as the final list, keeping every item the report supports.
