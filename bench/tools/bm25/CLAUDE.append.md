
## Finding every place a change reaches

Before finishing a change, run `python3 .what-else/bm25.py "<what you changed: the behavior, and the names you added or changed>"`. It ranks this project's files by how much they share with that description. Open each listed file you did not change and decide whether it needs the same change, such as another implementation of the same thing or another path that makes the same decision. In your summary, say which of them you checked.
