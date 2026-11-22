// Spots a model finding that does the scheduler's job: sums of days, slack,
// "tight", "late", meeting or missing the deadline.
//
// The model is told not to report these (prompt.ts), because it gets the sums
// wrong: for the Spring Market it added two tasks that run side by side and
// reported "20 days, no slack" for a plan that ends on day 18 with 3 days to
// spare. Code computes the end day and proves it, and the page leads with
// that, so a model finding of this kind is either a repeat or a contradiction.
// assemble.ts drops it.
//
// This is a heuristic over the finding's own words, and wording varies: told
// not to, the model made the same claim again as "adds up to more than that".
// So it is the second of two nets. The first is structural: assemble.ts also
// drops any model finding that quotes the plan's deadline, whatever it says.
// This one errs towards keeping a remark: only explicit sums and verdicts
// match, not every mention of time or money.

const CLAIMS = [
  /\bslack\b/,
  /\bcritical path\b/,
  // Sums: "adds up to 20 days", "2+10+3+2 days", "total 52 days", "52 days in total".
  /\badds? up to \d+/,
  /\d\s*\+\s*\d[\d\s+]*\s*(?:days?|weeks?)\b/,
  // "Check the date is achievable", "the deadline may not fit".
  /\b(?:date|deadline|timeline|schedule)\b[^.]{0,40}\b(?:achievable|feasible|realistic|unrealistic|fit)\b/,
  /\b(?:achievable|feasible|realistic|unrealistic)\b[^.]{0,40}\b(?:date|deadline|timeline|schedule)\b/,
  /\b(?:total|totals|totalling|totaling|sum to|sums to)\s+(?:of\s+)?\d+\s+days?\b/,
  /\b\d+\s+days?\s+in total\b/,
  // "Tight schedule", "the timeline is tight".
  /\btight\b[^.]{0,30}\b(?:schedule|timeline|timetable|deadline)\b/,
  /\b(?:schedule|timeline|timetable|deadline)\b[^.]{0,30}\btight\b/,
  // Verdicts against the deadline.
  /\b(?:miss|misses|missed|missing|meet|meets|overrun|overruns|overshoot|overshoots|exceed|exceeds)\s+(?:the|its)\s+(?:\S+\s+)?deadline\b/,
  /\b(?:finish|finishes|end|ends|complete|completes|done|ready)\b[^.]{0,20}\b(?:after|past|before)\s+the\s+(?:\S+\s+)?deadline\b/,
  /\b\d+\s+days?\s+(?:late|behind|over|early|spare|to spare)\b/,
  /\b(?:cannot|can't|can not|will not|won't|unlikely to)\s+(?:be\s+)?(?:finish|finished|done|complete|completed|ready)\b[^.]{0,20}\b(?:in time|on time)\b/,
].map((pattern) => new RegExp(pattern.source, "i"));

/** True when a finding's title and detail state a sum of days or a verdict on the schedule. */
export function claimsScheduleVerdict(text: string): boolean {
  return CLAIMS.some((pattern) => pattern.test(text));
}
