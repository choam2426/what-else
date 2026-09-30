// Live check of the boilerplate against the real API. Costs a fraction of a cent.
// Usage: TYPESAFE_API_KEY=... node scripts/smoke.mts

import { getChoice, getNoul, type SystemOneRequest } from "../src/jev/api.mts";
import { createClient } from "../src/jev/client.mts";
import { createLimiter } from "../src/jev/limiter.mts";
import { lineChoice, numberLines, type NumberedLines } from "../src/jev/lines.mts";
import { scanUnits } from "../src/jev/scan.mts";

const CONTEXT =
  "User.email becomes required (non-null). Before: `email: Optional[str] = None`. After: `email: str`.";

const TARGETS = {
  T1: {
    instructions: "Does this code create a User without providing an email?",
    criteria: {
      true: "Constructs or saves a User where email is omitted, None, or may be missing",
      false: "Always passes an email, or does not create Users",
    },
  },
  T2: {
    instructions: "Does this code handle the case where a user's email is None or missing?",
    criteria: {
      true: "Branches on email being None, empty or absent",
      false: "Never checks whether email is missing",
    },
  },
};

type Unit = { path: string; startLine: number; code: string; expected: string };

const UNITS: Unit[] = [
  {
    path: "app/signup.py",
    startLine: 10,
    expected: "T1",
    code: `def create_guest(name):
    user = User(name=name)
    user.save()
    return user`,
  },
  {
    path: "app/mailer.py",
    startLine: 3,
    expected: "T2",
    code: `def send_welcome(user):
    if user.email is None:
        return
    smtp.send(user.email, "Welcome!")`,
  },
  {
    path: "app/math.py",
    startLine: 1,
    expected: "none",
    code: `def add(a, b):
    return a + b`,
  },
];

const numbered = new Map<Unit, NumberedLines>(UNITS.map((u) => [u, numberLines(u.code, u.startLine)]));

function toRequest(unit: Unit): SystemOneRequest {
  const lines = numbered.get(unit)!;
  return {
    state: { context: CONTEXT, unit: { path: unit.path, language: "python", code: lines.text } },
    questions: {
      ...Object.fromEntries(Object.entries(TARGETS).map(([id, t]) => [id, { type: "noul", ...t }])),
      T_any: { type: "noul", instructions: "Would this code be incorrect or inconsistent after the change described in context?" },
      line: lineChoice(lines, "Which line most needs to change because of the change described in context?"),
    },
  };
}

const client = createClient({ limiter: createLimiter() });
const report = await scanUnits(UNITS, toRequest, { client });

for (const { unit, response } of report.succeeded) {
  const scores = [...Object.keys(TARGETS), "T_any"].map((id) => `${id}=${getNoul(response, id).toFixed(2)}`);
  const line = numbered.get(unit)!.lineOf(getChoice(response, "line").choice);
  console.log(`${unit.path}:${line}  expected=${unit.expected}  ${scores.join(" ")}`);
}
for (const { unit, error } of report.failed) console.log(`FAILED ${unit.path}: ${String(error)}`);
console.log(
  `units=${UNITS.length} ok=${report.succeeded.length} failed=${report.failed.length}`,
  `input_tokens=${report.usage.input_tokens} elapsed=${Math.round(report.elapsedMs)}ms`,
);
if (report.failed.length > 0) process.exitCode = 1;
