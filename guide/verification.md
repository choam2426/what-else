# Verifying a setup on the project

Verification answers one question with the project's own history: does the setup reach the places changes here have actually missed, and at what cost per change?

Which method beats which is a different question, and this repository answers it from controlled experiments: many runs of each method on the same tasks, with blind judges comparing them (see the method cards). A handful of runs in one project cannot settle it, since agents vary from run to run by more than the gaps between methods. So verification here checks the setup against known answers, and leaves the comparison of methods to the records.

## Replaying miss events

A **miss event** from the diagnosis has a known answer: the place the original change missed, which a later commit filled in. That makes it a test case that needs no judge.

1. **Set up the case.** Take a copy of the repository at the commit before the original change, without the later history, so the answer cannot leak in. Add the setup to that copy.
2. **Write the request.** Use the issue, ticket or pull request description written before the change, when there is one. Otherwise write a short request from the original change's intent: the behavior wanted, in the words a developer would use. Leave out the missed place and anything that points to it.
3. **Run the agent once** with the setup, the way the project's developers run it.
4. **Check the answer.** Did the final change reach the missed place, by the same edit or by another one that makes it unnecessary? Note the cost and time of the run.

Three to five miss events make a useful first check. Prefer events whose missed place was logic over documentation, since those cost more when they ship.

A case says something about the setup only if the agent without it would still miss the place. When the budget allows, run one case without the setup as well; if the plain agent already reaches the place, the event no longer tests anything and can be dropped.

## Checking an addition

Rules or a search tool are added on top of the base steps (the check step and the second look) only for misses the base steps leave. So check an addition on exactly those miss events: replay them with the base steps, and add the rules or the tool only for the events still missed. Then replay those events again with the addition, and see whether it now reaches them.

A **ranking check** costs even less for a search tool: ask it about the original change and see whether the missed place appears near the top of its list.

## Evidence from use

Once the setup is in use, every change adds evidence for free. The second look reports what it found and what the agent did with each finding, in the agent's summary. Over a few weeks, those summaries show what the second look catches in this project, what it gets wrong, and which kinds of places keep surfacing. Fold what they show into the rules, as described in [rules.md](rules.md).

## Reporting

Report what the replays showed: for each miss event, whether the setup reached the place, and the cost and time per run. Say plainly what that many cases can and cannot show. "4 of 5 past misses were reached" is a finding; "better than the base steps" is not, at this size. Report the model versions, the harness and the date, since results age as models improve.

When nobody is available to agree on spending, run the replays on a small amount you state, such as three miss events with the setup, and report as above.
