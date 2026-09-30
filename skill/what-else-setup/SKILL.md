---
name: what-else-setup
description: Sets up change-scope finding for a repository together with the user, so that an agent finds every place a change must also touch in one pass. Diagnoses where changes in this repository miss places, recommends a fitting setup from recorded experiments (repository rules, lexical or semantic search, Jev, delegation to a small model, or leaving things as they are), builds what the user agrees to, and checks it on the repository's own history. Use when the user asks to set up change-scope finding, to stop agents from missing places a change must also touch, or to choose between these approaches for a repository.
---

# What-else setup

## Goal

When an agent changes code, it finds every other place that must also change, in the same pass, quickly, cheaply and accurately. Nobody pays later for discovering the places it missed and changing them again. The larger the codebase, the more often places get missed, and the more this matters.

## What this is

There is no single right setup. In the experiments behind this skill, the same approach cut misses sharply in one repository and changed nothing in another, where the plain agent already missed almost nothing. So this skill carries two things:

- **What earlier experiments found**, as method cards in [references/methods.md](references/methods.md): what each approach is, where it helped, where it did not, what it cost, and under which conditions it was measured.
- **A way to build, together with the user, the setup that fits this repository**, described below.

This file says what to do and why. How to build each part is yours to decide for this repository and this environment: the harness, the operating system, the languages and the tools at hand.

## The process

1. **Learn the repository**: its layout, contributing guide and agent instruction files; the tools already in place, such as language servers, code search, indexes and MCP servers; what the harness offers, such as always-loaded instructions, skills and subagents; and its history.
2. **Diagnose** where changes in this repository miss places, following [references/diagnosis.md](references/diagnosis.md). The diagnosis says whether the repository has a missing-places problem at all, which kinds of places get missed, and how costly those misses are.
3. **Propose a setup.** Read the method cards that fit the diagnosis, and compare the conditions each result was measured in with this repository. Recommend one setup with the reasons for it. Name the alternatives you considered, including leaving things as they are, and say how you will verify the setup and what verifying costs.
4. **Agree on it with the user.** Some decisions belong to the user: whether code may leave the machine, how much spending and waiting per change is acceptable, and which option to take. Put them to the user together, with your recommendation first.
5. **Build** what was agreed.
6. **Verify it on this repository**, following [references/verification.md](references/verification.md): show what the setup finds that the plain agent misses, and what it costs. Spend on paid services only as agreed.
7. **Report** the diagnosis, the options considered, what was agreed, what was built, the verification numbers, your assumptions, and what you could not check. Write it so another person could learn from it, since it is also a record of one more repository.

When nobody is available to answer, take the default: repository rules placed in the always-loaded instructions (the measured form in [references/rules.md](references/rules.md)), built with local tools only, so no code leaves the machine. List the other options in the report as proposals.

## Where to start the proposal

In the repository measured most carefully so far (Django), most real misses were places the repository's conventions call for: release notes, patch release notes, reference docs. Repository rules placed in the always-loaded instructions, as described in [references/rules.md](references/rules.md), fixed most of them for a small cost. So start the proposal from repository rules, and add a search tool where the diagnosis shows misses that neither names nor rules reach. The method cards say which search tool fits which kind of miss, and [references/scope-method.md](references/scope-method.md) is the checklist of places any change can reach.

## Keep it improving

The setup gets better with use. Each change leaves short notes: places that had to change and were missed, rules that misled, searches that wasted time. When notes accumulate, fold them into the rules and the tools. When the notes show a kind of miss the current setup keeps missing, propose another option from the method cards to the user.

## The setup stands on its own

The setup keeps working where this skill is not installed, so copy into it whatever it needs from here, such as the rules format or the scope method.
