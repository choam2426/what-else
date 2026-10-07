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
5. **Build** what was agreed: instructions, notes and tools for finding the scope of a change. Leave the project's own code, dependencies and build settings as they are; when something in the environment gets in the way of building or verifying, report it instead.
6. **Verify it on the project**, following [guide/verification.md](guide/verification.md): show what the setup finds that the plain agent misses, and what it costs. Spend on paid services only as agreed.
7. **Report** the diagnosis, the options considered, what was agreed, what was built, the verification numbers, your assumptions, and what you could not check. Write it so another person could learn from it, since it is also a record of one more project.

When nobody is available to answer, go ahead with your own recommendation. Two decisions still belong to the user, so take the cautious side of each: keep code on the machine, choosing a local alternative where your recommendation would send code to a service, and keep spending to a small amount you state in the report. Verify the setup within that amount, and report what you would change with the user's answers.

## Where to start the proposal

Start every setup from two steps in the always-loaded instructions, both described in the method cards with the measured text:

- **A check step before finishing**: the agent checks the other places a change may reach and says which it checked.
- **A second look with an acceptance rule**: a subagent with none of the agent's context reads the request and the diff and reports places the change still has to reach; the agent fixes each one whose reason holds up in the code, including places the request does not name.

On 14 repositories whose plain runs kept missing a second code path or a sibling implementation, the check step alone cut scope misses by about a third, and the second look with the acceptance rule cut them by about 60% (15.5 → 6 of 28). Repository rules and search tools did no better than the check step there.

Then add what the diagnosis shows these two leave:

- **Repository rules** ([guide/rules.md](guide/rules.md)) where misses are places the project's conventions call for, such as release notes and reference docs. On Django, rules fixed most of these for a small cost.
- **A search tool** where misses share no name with the change and the agent does not think to look there.

Verify each addition against these two steps alone, since that is what it has to beat. [guide/scope-method.md](guide/scope-method.md) is the checklist of places any change can reach.

## Keep it improving

The setup gets better with use. Each change leaves short notes: places that had to change and were missed, rules that misled, searches that wasted time. When notes accumulate, fold them into the rules and the tools. When the notes show a kind of miss the current setup keeps missing, propose another option from the method cards to the user.

The setup keeps working without this repository, so copy into the project whatever it needs from here, such as the rules format or the scope method.
