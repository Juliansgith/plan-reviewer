// Deterministic signals read straight from the plan text, so code can check
// the model instead of trusting it:
//
// - findInstructionsToReviewer: sentences that try to tell the reviewer what
//   to report. The Harbour Run plan contains one; unseen plans may too.
// - findDeadlineStatements: sentences that state the finish day for the whole
//   plan, or the day of the event, relative to kickoff. Two different days
//   mean the plan does not clearly state one. A date for a single task is not
//   a deadline statement.
//
// Both are heuristics. They err towards precision: a missed signal falls back
// to the model's own reading, which is still verified against the plan.

import { collapseWhitespace, splitSentences, type Sentence } from "../text";

export type Statement = { day: number; quote: string; start: number; end: number };
export type Instruction = { quote: string; start: number; end: number };

const UNITS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Reads "21", "five", "twenty-one", "twenty one" or "a hundred"; null for anything else. */
export function parseNumberWord(text: string): number | null {
  const word = text.trim().toLowerCase();
  if (/^\d+$/.test(word)) return Number(word);
  if (/^(a |one )?hundred$/.test(word)) return 100;
  const unit = UNITS.indexOf(word);
  if (unit >= 0) return unit;
  const [tens, ones] = word.split(/[- ]/);
  const tensValue = TENS.indexOf(tens ?? "");
  if (tensValue < 2) return null;
  if (ones === undefined) return tensValue * 10;
  const onesValue = UNITS.indexOf(ones);
  return onesValue >= 1 && onesValue <= 9 ? tensValue * 10 + onesValue : null;
}

const REVIEWER =
  "(?:reviews?|reviewers?|assistants?|ai|a\\.i\\.|models?|llms?|chatbots?|language models?|automated (?:review|tool|system)s?)";
const INSTRUCTION_PATTERNS = [
  /\b(?:ignore|disregard|forget)\b[^.]{0,60}\b(?:instructions?|above|previous|prior|rules?|guidelines)\b/i,
  new RegExp(
    `\\b${REVIEWER}\\b[^.]{0,80}\\b(?:should|must|shall|needs? to|has to|is to|are to)\\b[^.]{0,80}\\b(?:report|record|return|say|state|mark|approve|output|list|give|set|treat|ignore|flag|find)\\b`,
    "i",
  ),
  /\b(?:report|raise|return|give|list|find)\s+(?:no|zero)\s+(?:findings|issues|problems|concerns)\b/i,
  new RegExp(`\\b(?:note|message|instructions?)\\s+(?:to|for)\\s+(?:the\\s+)?${REVIEWER}`, "i"),
];
const APPROVAL_CLAIM =
  /\b(?:pre-?approved|already (?:been )?approved|has been approved|was approved)\b/i;

export function findInstructionsToReviewer(plan: string): Instruction[] {
  const sentences = splitSentences(plan);
  const spans: { start: number; end: number }[] = [];
  sentences.forEach((sentence, index) => {
    const text = collapseWhitespace(sentence.text);
    if (!INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text))) return;
    let start = sentence.start;
    // An approval claim just before the instruction is part of the same move.
    const previous: Sentence | undefined = sentences[index - 1];
    const between = previous ? plan.slice(previous.end, sentence.start) : "";
    if (previous && !between.includes("\n\n") && APPROVAL_CLAIM.test(previous.text))
      start = previous.start;
    const last = spans[spans.length - 1];
    if (last && start <= last.end + 2) last.end = sentence.end;
    else spans.push({ start, end: sentence.end });
  });
  return spans.map((span) => ({
    ...span,
    quote: collapseWhitespace(plan.slice(span.start, span.end)).trim(),
  }));
}

const NUMBER = "(\\d+|[a-z]+(?:[- ][a-z]+)?)";
const RELATIVE_TO_KICKOFF = new RegExp(
  `\\b${NUMBER}\\s+(days?|weeks?)\\s+(?:after|from)\\s+(?:the\\s+|our\\s+)?kick-?\\s?off\\b`,
  "gi",
);
const DAY_NUMBER =
  /\b(?:by|on|of|until|before)\s+(?:the\s+(?:evening|morning|afternoon|night)\s+of\s+)?day\s+(\d+)\b/gi;

// A dated sentence states the plan's deadline only when it speaks for the
// whole plan ("everything ... by", "all the tasks", "our deadline is") or
// gives the day of the event itself ("the market is on ...", "the fair
// opens ..."). A date for one task ("invitations out two weeks after
// kickoff", "the road closure must be approved by day 19") is that task's
// own date: counting it would invent a second deadline and a false conflict.
const WHOLE_PLAN =
  /\beverything\b|\ball\s+(?:of\s+)?(?:the\s+|our\s+|these\s+)?(?:tasks|jobs|work|preparations)\b|\b(?:whole|entire)\s+(?:plan|event|project)\b|\bdeadline\b(?!\s+(?:for|to)\b)/i;
const EVENT_WORDS = [
  "event",
  "festival",
  "market",
  "run",
  "race",
  "fair",
  "fete",
  "fête",
  "show",
  "parade",
  "concert",
  "carnival",
  "gala",
  "regatta",
  "walk",
  "ride",
  "party",
  "celebration",
  "tournament",
  "opening",
  "launch",
];
const NOT_AN_EVENT_NAME = new Set([
  "plan",
  "proposal",
  "committee",
  "council",
  "the",
  "and",
  "for",
]);

/** Matches "the <event> is / opens / takes place ...", for common event words and the plan's own. */
function eventDayPattern(plan: string): RegExp {
  // The last word of the title is usually what the committee calls the event:
  // "Spring Market", "Lantern Festival", "Duck Derby".
  const title = /^#\s+(.+)$/m.exec(plan)?.[1] ?? "";
  const named = (title.match(/\p{L}{3,}/gu) ?? []).pop()?.toLowerCase();
  const words = named && !NOT_AN_EVENT_NAME.has(named) ? [...EVENT_WORDS, named] : EVENT_WORDS;
  return new RegExp(
    `\\b(?:the|our|this year's)\\s+(?:[\\p{L}'’-]+\\s+){0,3}?(?:${words.join("|")})\\s+(?:itself\\s+)?(?:is|are|will be|takes place|will take place|is held|will be held|happens|opens|starts|begins|goes ahead)\\b`,
    "iu",
  );
}

function readNumber(captured: string): number | null {
  const whole = parseNumberWord(captured);
  if (whole !== null) return whole;
  const lastWord = captured.split(/[- ]/).pop() ?? "";
  return parseNumberWord(lastWord);
}

export function findDeadlineStatements(plan: string): Statement[] {
  const injected = findInstructionsToReviewer(plan);
  const statements: Statement[] = [];
  const eventDay = eventDayPattern(plan);
  for (const sentence of splitSentences(plan)) {
    if (injected.some((span) => sentence.start < span.end && span.start < sentence.end)) continue;
    const text = collapseWhitespace(sentence.text);
    if (!WHOLE_PLAN.test(text) && !eventDay.test(text)) continue;
    const days = new Set<number>();
    for (const match of text.matchAll(RELATIVE_TO_KICKOFF)) {
      const count = readNumber(match[1]!);
      if (count !== null && count > 0)
        days.add(match[2]!.toLowerCase().startsWith("week") ? count * 7 : count);
    }
    for (const match of text.matchAll(DAY_NUMBER)) days.add(Number(match[1]));
    for (const day of days) {
      statements.push({ day, quote: text.trim(), start: sentence.start, end: sentence.end });
    }
  }
  return statements;
}

/** True when the quote states the day: it mentions n days, or n weeks for day 7n. */
export function quoteStatesDay(quote: string, day: number): boolean {
  const numbers = [...quote.matchAll(/\b(\d+|[a-z]+(?:-[a-z]+)?)\b/gi)]
    .map((match) => parseNumberWord(match[1]!))
    .filter((n): n is number => n !== null && n > 0);
  return numbers.some((n) => n === day || n * 7 === day);
}
