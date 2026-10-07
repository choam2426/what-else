
## Finding every place a change reaches

Before finishing a change, check whether it must also reach other places in this project: another implementation of the same thing, another path that makes the same decision, a list or registry the new thing belongs in, callers that depend on changed behavior, and declared types or schemas. Open the likely places and decide for each whether it needs the same change. In your summary, say which you checked.
