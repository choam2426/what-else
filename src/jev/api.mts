// Types and helpers for TypeSafe's System One API (POST /v1/systemone).
// Checked against jev-1.13.0 on 2026-09-28.

export const MAX_CHOICES = 255;

/** Measured: an almost empty request bills ~270 input tokens. */
export const REQUEST_OVERHEAD_TOKENS = 270;
/** Measured on code: ~2.6 chars per token. Rounded down to overestimate. */
const BYTES_PER_TOKEN = 2.5;

export type Instructions = string | Record<string, unknown> | unknown[];
export type State = string | Record<string, unknown> | unknown[];

export type NoulQuestion = {
  type: "noul";
  instructions: Instructions;
  criteria?: { true: string; false: string };
};

export type ChoiceQuestion = {
  type: "choice";
  instructions: Instructions;
  /** Option -> description, or null for none. At most MAX_CHOICES options. */
  criteria: Record<string, string | null>;
};

export type ScoreQuestion = {
  type: "score";
  instructions: Instructions;
  /** Ordered level descriptions, lowest first. 2 to 10 levels. */
  criteria: string[];
};

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type SystemOneRequest = {
  /** Defaults to the client's model. */
  model?: string;
  state: State;
  questions: Record<string, Question>;
};

export type NoulAnswer = { type: "noul"; noul: number };

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type Usage = { input_tokens: number; output_tokens: number };

export type SystemOneResponse = {
  model: string;
  answers: Record<string, Answer>;
  usage: Usage;
};

/** Rough upper estimate of billed input tokens, for rate limiting. */
export function estimateTokens(request: SystemOneRequest): number {
  // UTF-8 bytes rather than string length, so non-ASCII text such as
  // Korean comments is not undercounted.
  const bytes = Buffer.byteLength(JSON.stringify([request.state, request.questions]), "utf8");
  return REQUEST_OVERHEAD_TOKENS + Math.ceil(bytes / BYTES_PER_TOKEN);
}

export function getNoul(response: SystemOneResponse, id: string): number {
  return expectAnswer(response, id, "noul").noul;
}

export function getChoice(response: SystemOneResponse, id: string): ChoiceAnswer {
  return expectAnswer(response, id, "choice");
}

export function getScore(response: SystemOneResponse, id: string): ScoreAnswer {
  return expectAnswer(response, id, "score");
}

function expectAnswer<T extends Answer["type"]>(
  response: SystemOneResponse,
  id: string,
  type: T,
): Extract<Answer, { type: T }> {
  const answer = response.answers[id];
  if (answer === undefined) throw new Error(`No answer for question "${id}"`);
  if (answer.type !== type) throw new Error(`Question "${id}" answered as ${answer.type}, expected ${type}`);
  return answer as Extract<Answer, { type: T }>;
}
