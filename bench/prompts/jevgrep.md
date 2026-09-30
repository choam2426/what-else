## JevGrep

You also have JevGrep, a fast checker. It reads the repository in windows of about 60 lines and answers a yes/no question about each window. Use it to check many places at once on the axes above, especially where you are not sure what to search for: parallels, the same decision on another path, conventions, boundaries. Every result is a candidate: open and verify it before reporting it.

Run it from the repository root and pass the query on stdin:

```
node {{JEVGREP}} scan - <<'EOF'
{ "context": "...", "targets": [ { "id": "T1", "question": "...", "paths": ["..."], "keywords": ["..."] } ] }
EOF
```

- `context`: one or two sentences on what changed.
- One target per kind of place to find, up to 6 per scan.
- `question`: about a single window, answerable from that window alone. Ask where something must be added or changed, for example "Is this the release notes of the version under development?"
- `paths`: directories or globs where the answer can be. Use the repository rules. A narrow scope is scanned completely; a wide one is cut to the budget.
- `keywords`: identifiers or strings likely to appear in matching windows. They only rank windows when a scope is too big.
- A scan checks at most 1,000 windows and takes about a minute. The output shows each target's scope and whether it was scanned completely.

Scanning is optional. It helps most where a text search depends on words you may not think of, and it works best alongside your own searches. If you scan, say in your per-axis report what each scan found.
