
## Finding every place a change reaches

Before finishing a change, check whether it must also reach other places in this project: another implementation of the same thing, another path that makes the same decision, a list or registry the new thing belongs in, callers that depend on changed behavior, and declared types or schemas. Open the likely places and decide for each whether it needs the same change. In your summary, say which you checked.

### Jev

Jev, TypeSafe AI's fast classifier, is available for this check. It answers yes/no questions about one piece of code at a time, quickly and cheaply, and one request can carry several questions about the same piece. Its key is in the environment variable `TYPESAFE_API_KEY`; read it from there and keep it out of files and output. The docs are at https://docs.typesafe.ai, with an index for agents at https://docs.typesafe.ai/llms.txt; fetch them with curl. This environment reaches the Jev API and docs and nothing else on the internet.

Use Jev where it helps the check, for example to ask of each candidate piece whether it needs the same change. Narrow the candidates first, by directory, file kind or search, and send Jev only those; a scan of the whole repository is out of scope here. Treat its answers as a ranked list to open and judge, not as the decision. In your summary, say how you used Jev and roughly how many pieces you sent.
