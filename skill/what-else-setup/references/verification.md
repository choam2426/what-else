# Verifying a setup on this repository

Verification shows the user, with this repository's own changes, what the setup finds that the plain agent misses and what it costs. The recorded experiments suggest where to start; this repository's numbers decide.

## Test cases

- **Miss events** from the diagnosis make the best cases: the original change is the task, and the place it missed is what the setup must find.
- **Past changes with a request written before the implementation**, such as an issue, a ticket or a pull request description, make good cases too. Commit messages make poor requests: they are either too terse to act on or they describe the answer, and the historical diff is only one of several correct implementations.
- Keep the cases you tune the setup on apart from the cases you judge it by. Judging on the cases you tuned on overstates the gain.
- Give each case a copy of the repository as it was before the change, without the later history, so the answer cannot leak in.

## What to measure

- **Places found**: which required places the final change covers. Judge a missed place against the agent's own implementation, since a different, correct implementation may not need it.
- **Real misses per change**, and how costly each would have been: caught by tests, or shipped; documentation, or logic.
- **Cost and time** per change, including paid services.
- **The plain agent on the same cases**, as the baseline.

## Cheap first

- A **ranking check** asks only whether each missed place appears near the top of a ranked search's list. It costs little and compares search backends quickly.
- A **full run** has the agent make the change with and without the setup. It measures what the user will get, and costs a model run per case. Agree with the user on how many; when nobody is available to agree, run the ranking check and a few full runs, and propose more in the report.

## Reading the numbers

- Agents vary from run to run: the same plain agent can find twice as much on one run as on another, and cost two to three times as much. Run each side more than once where a decision rests on the difference, and compare case by case.
- Report the model versions, the harness and the date, since results age as models improve.
