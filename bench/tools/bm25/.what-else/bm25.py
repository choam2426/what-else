#!/usr/bin/env python3
"""Rank this project's files by how much they share with a description of a change (BM25).

Usage: python3 .what-else/bm25.py "what changed: the behavior, and the names you added or changed"
Prints the top files with the lines that share the most terms, so you can check whether each one
needs the same change. Reads only files git tracks; standard library only.
"""
import math
import re
import subprocess
import sys
from collections import Counter

TOP = 15
K1, B = 1.2, 0.75
STOP = set("""a an and are as at be by for from has have in is it its of on or that the this to was were will with
not no do does if then else return true false none null self this new let var const def func function class
import export package public private static void int str string bool""".split())


def terms(text):
    out = []
    for word in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text):
        parts = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", word).replace("_", " ").lower().split()
        whole = word.lower()
        for t in parts + ([whole] if len(parts) > 1 else []):
            if len(t) > 1 and t not in STOP:
                out.append(t)
    return out


def tracked_files():
    names = subprocess.run(["git", "ls-files", "-z"], capture_output=True, check=True).stdout.split(b"\0")
    for raw in names:
        if not raw:
            continue
        path = raw.decode("utf-8", "replace")
        try:
            with open(path, "rb") as f:
                data = f.read(400_000)
        except OSError:
            continue
        if b"\0" in data[:4096]:
            continue
        yield path, data.decode("utf-8", "replace")


def main():
    query = " ".join(sys.argv[1:]) or sys.stdin.read()
    q = [t for t in dict.fromkeys(terms(query))]
    if not q:
        print("Give a description of the change as the argument.")
        return
    docs = []
    for path, text in tracked_files():
        tf = Counter(terms(path + " " + text))
        docs.append((path, text, tf, sum(tf.values())))
    n = len(docs)
    avg = sum(d[3] for d in docs) / max(n, 1)
    df = Counter(t for _, _, tf, _ in docs for t in q if t in tf)
    scored = []
    for path, text, tf, length in docs:
        s = 0.0
        for t in q:
            f = tf.get(t, 0)
            if f:
                idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
                s += idf * f * (K1 + 1) / (f + K1 * (1 - B + B * length / avg))
        if s > 0:
            scored.append((s, path, text))
    scored.sort(reverse=True)
    qset = set(q)
    for s, path, text in scored[:TOP]:
        lines = []
        for i, line in enumerate(text.splitlines(), 1):
            hit = qset.intersection(terms(line))
            if hit:
                lines.append((len(hit), i))
        best = sorted(lines, reverse=True)[:3]
        where = ", ".join(f"line {i}" for _, i in sorted(best, key=lambda x: x[1]))
        print(f"{s:6.2f}  {path}" + (f"  ({where})" if where else ""))


if __name__ == "__main__":
    main()
