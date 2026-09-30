---
name: jevgrep-setup
description: Sets up change-scope finding for a repository, so that an agent finds every place that must also change for a change quickly, cheaply and accurately, in one pass. Use when the user asks to set up JevGrep or change-scope finding for a repository.
---

# JevGrep setup

## Goal

When an agent changes code, it finds every other place that must also change, in the same pass, quickly, cheaply and accurately. Nobody pays later for discovering the places it missed and changing them again. The larger the codebase, the more often places get missed, and the more this matters.

The scope is found as soon as the change is decided, before files are edited. A small, fast model searches broadly and filters; the main agent reviews only what survived, makes the final call, and makes the whole change in one pass.

This file says what to build and why. How to build it is yours to decide for this repository and this environment: the harness, the operating system, the languages and tools at hand.

## What to build

1. **Repository rules**: what this repository changes together. Contents in [references/contracts.md](references/contracts.md#rules).
2. **JevGrep**: a tool that asks Jev, TypeSafe AI's fast classifier ([docs](https://docs.typesafe.ai), index for agents at https://docs.typesafe.ai/llms.txt), a yes/no question about each piece of the repository.
   - It returns, per question, every piece likely to answer yes, ranked, each with its path and line range, and says how many it cut if it cut any.
   - It reports the parts it left unchecked. Its limits let the narrow scans the method asks for always run.
   - Jev judges only the piece it is given, so each question must be answerable from one piece alone.
   - Jev answers several questions about a piece in one request, and each extra question adds only a few tokens, so a scan takes many questions at once and asks them together.
   - The code it sends leaves the machine: send files the repository tracks, and leave secrets out.
   - It records each run: the questions, where it looked, what came back, and how many requests it made.
3. **A worker**: a small, fast model whose job is finding the full scope of a planned change. It follows [references/methodology.md](references/methodology.md), knows the repository rules, and uses JevGrep. Where the harness has no subagents, the main agent plays this role itself.
4. **A change-scope entry point** for the main agent, carrying the flow, the brief and the small-change path from [references/contracts.md](references/contracts.md#flow).
   - It is used as soon as a change is decided, before editing, whenever the change can reach beyond one place: a changed contract, behavior, name, data shape, supported range or public surface.
   - The main agent picks the entry point from its description, so write the description with care: what it does, and when to use it, in the words tasks and requests actually use, such as "implement", "change", "fix", "rename", "deprecate", "drop support", "what else needs to change", "find every other place that must also change".
   - Also point to it from the project instructions the harness always loads.

The roles, the flow, the brief and the report are defined in [references/contracts.md](references/contracts.md). They are what other people rely on, so they stay as written there; everything else in the implementation is yours to shape and improve.

The implementation stands on its own. It keeps working where this setup skill is not installed, so copy into it whatever it needs from here, such as the method.

## How to go about it

- Learn the repository: its layout, contributing guide, agent instruction files, and its history, especially which files change together.
- Write the rules from what the repository actually does.
- Build JevGrep and the worker, and connect them to the entry point.
- Run the checks in [references/contracts.md](references/contracts.md#checks), including one trial change in a fresh session.
- Report what you built, the choices you made, your assumptions, and what you could not check.

When nobody is available to answer questions, choose reasonable defaults and list them in your report.

## Keep it improving

The implementation gets better with use. Each change leaves a run record and notes on what was missed, what misled and what was wasted; when notes accumulate, fold them into the rules, the question wording, JevGrep and the entry point's description. See [references/contracts.md](references/contracts.md#improving).
