
## Finding every place a change reaches

Before finishing a change, check whether it must also reach other places in this project: another implementation of the same thing, another path that makes the same decision, a list or registry the new thing belongs in, callers that depend on changed behavior, and declared types or schemas. Open the likely places and decide for each whether it needs the same change. In your summary, say which you checked.

### Jev, for the places you have not thought of

The places a change misses are usually ones nobody thought to open, not ones that were opened and misjudged. Searching by name finds the places you already suspect; Jev finds the ones you do not.

Jev, TypeSafe AI's fast classifier, answers yes/no questions about one piece of code at a time, quickly and cheaply, and one request can carry several questions about the same piece. Its key is in the environment variable `TYPESAFE_API_KEY`; read it from there and keep it out of files and output. The docs are at https://docs.typesafe.ai, with an index for agents at https://docs.typesafe.ai/llms.txt; fetch them with curl. This environment reaches the Jev API and docs and nothing else on the internet.

So when you check a change, use Jev over the area the change could reach, beyond the candidates you already have: the directories and modules of the files you changed, their siblings, and the code that imports or registers what you changed. Ask each piece there, in plain words, whether it does the same thing, makes the same decision, lists the same kind of item, or depends on the behavior you changed. Open what it ranks high and you have not opened yet, and decide for each. Keep the area to what the change could reach; a scan of the whole repository is out of scope here.

Whether Jev is worth it for a given change is your call. In your summary, say how you used Jev, roughly how many pieces you sent, and what it led you to open.
