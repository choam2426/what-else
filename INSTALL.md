# Setting up what-else in a project

You are reading this because someone pointed you to this repository and asked you to set up, in their project, what it describes. This file is for you, the agent. Read it and the guide files it links to in full before you start. Links are relative to this repository; each file's raw text is at `https://raw.githubusercontent.com/choam2426/what-else/main/<path>`, for example `https://raw.githubusercontent.com/choam2426/what-else/main/guide/methods.md`.

Nothing from this repository gets installed in the project. What you build lives in the project and stands on its own.

## Goal

When an agent changes code in the project, it finds every other place that must also change, in the same pass, quickly, cheaply and accurately. Nobody pays later for discovering the places it missed and changing them again. The larger the codebase, the more often places get missed, and the more this matters.

## What this repository gives you

There is no single right setup. In the experiments behind this repository, the same approach cut misses sharply in one repository and changed nothing in another, where the plain agent already missed almost nothing. So this repository gives you two things:

- **What earlier experiments found**, as method cards in [guide/methods.md](guide/methods.md): what each approach is, where it helped, where it did not, what it cost, and under which conditions it was measured.
- **A way to build, together with the user, the setup that fits their project**, described below.

This file says what to do and why. How to build each part is yours to decide for the project and its environment: the harness, the operating system, the languages and the tools at hand.

## The process

1. **Learn the project**: its layout, contributing guide and agent instruction files; the tools already in place, such as language servers, code search, indexes and MCP servers; what the harness offers, such as always-loaded instructions, skills and subagents; and its history.
2. **Diagnose** where changes in the project miss places, following [guide/diagnosis.md](guide/diagnosis.md). The diagnosis says whether the project has a missing-places problem at all, which kinds of places get missed, and how costly those misses are.
3. **Propose a setup.** Read the method cards that fit the diagnosis, and compare the conditions each result was measured in with the project. Recommend one setup with the reasons for it. Name the alternatives you considered, including leaving things as they are, and say how you will verify the setup and what verifying costs.
4. **Agree on it with the user.** Some decisions belong to the user: whether code may leave the machine, how much spending and waiting per change is acceptable, and which option to take. Put them to the user together, with your recommendation first.
5. **Build** what was agreed.
6. **Verify it on the project**, following [guide/verification.md](guide/verification.md): show what the setup finds that the plain agent misses, and what it costs. Spend on paid services only as agreed.
7. **Report** the diagnosis, the options considered, what was agreed, what was built, the verification numbers, your assumptions, and what you could not check. Write it so another person could learn from it, since it is also a record of one more project.

When nobody is available to answer, take the default: repository rules placed in the always-loaded instructions (the measured form in [guide/rules.md](guide/rules.md)), built with local tools only, so no code leaves the machine. List the other options in the report as proposals.

## Where to start the proposal

In the repository measured most carefully so far (Django), most real misses were places the repository's conventions call for: release notes, patch release notes, reference docs. Repository rules placed in the always-loaded instructions, as described in [guide/rules.md](guide/rules.md), fixed most of them for a small cost. So start the proposal from repository rules, and add a search tool where the diagnosis shows misses that neither names nor rules reach. The method cards say which search tool fits which kind of miss, and [guide/scope-method.md](guide/scope-method.md) is the checklist of places any change can reach.

## Keep it improving

The setup gets better with use. Each change leaves short notes: places that had to change and were missed, rules that misled, searches that wasted time. When notes accumulate, fold them into the rules and the tools. When the notes show a kind of miss the current setup keeps missing, propose another option from the method cards to the user.

The setup keeps working without this repository, so copy into the project whatever it needs from here, such as the rules format or the scope method.
