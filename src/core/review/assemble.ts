// Where code decides. Takes a verified model answer and:
//
// - settles the deadline from the plan's own statements, ignoring any
//   deadline that sits inside text aimed at the reviewer;
// - adds findings that code can establish for certain: circular
//   dependencies, lateness and its cause, conflicting or missing deadlines,
//   instructions to the reviewer, tasks with no owner, owner names that look
//   like the same person;
// - drops model findings that quote the same text as a code finding, and
//   those that state sums of days or a verdict on the schedule;
// - orders findings by severity, code findings first within each level.

import { parseReview } from "../contracts";
import { buildGraph, cyclicGroups, findCycle } from "../schedule/graph";
import { scheduleTasks } from "../schedule/schedule";
import { locateQuote, type Span } from "../text";
import type { CheckedAnswer } from "./check";
import { claimsScheduleVerdict } from "./schedule-claims";
import { findDeadlineStatements, findInstructionsToReviewer, quoteStatesDay } from "./signals";
import type { ReviewFinding, StoredReview } from "./types";

/**
 * A finding code establishes. A model finding is dropped as a duplicate when
 * its quote overlaps one of `covers` and, if `absorbs` is set, its title or
 * detail is about the same thing (so a remark on another issue survives).
 */
type CodeFinding = ReviewFinding & { covers: Span[]; absorbs?: RegExp };

const ABOUT_A_CIRCLE = /circ|cycle|each other|one another|loop|deadlock|both ways/i;
const ABOUT_AN_OWNER = /owner|nobody|no one|not named|unnamed|unassigned|\btbc\b|responsib/i;

const SEVERITY_RANK = { blocker: 0, warning: 1, note: 2 } as const;
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const quoted = (text: string) => `"${text}"`;
const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

export type AssembleMeta = StoredReview["meta"];

export function assembleReview(
  plan: string,
  answer: CheckedAnswer,
  meta: AssembleMeta,
): StoredReview {
  const instructions = findInstructionsToReviewer(plan);
  const statements = findDeadlineStatements(plan);
  const codeFindings: CodeFinding[] = [];
  const spanOf = (quote: string | null): Span | null =>
    quote === null ? null : locateQuote(plan, quote);
  const insideInstructions = (span: Span | null) =>
    !!span && instructions.some((i) => overlaps(i, span));

  // --- Deadline -----------------------------------------------------------
  const modelSpan = spanOf(answer.deadline_quote);
  const modelVerified =
    answer.deadline_day !== null &&
    answer.deadline_quote !== null &&
    modelSpan !== null &&
    !insideInstructions(modelSpan) &&
    quoteStatesDay(answer.deadline_quote, answer.deadline_day);

  const candidates = new Map<number, { quote: string; span: Span }>();
  for (const statement of statements) {
    if (!candidates.has(statement.day))
      candidates.set(statement.day, { quote: statement.quote, span: statement });
  }
  if (modelVerified && !candidates.has(answer.deadline_day!) && candidates.size > 0) {
    candidates.set(answer.deadline_day!, { quote: answer.deadline_quote!, span: modelSpan! });
  }

  let deadline_day: number | null = null;
  let deadline_quote: string | null = null;
  if (candidates.size >= 2) {
    const listed = [...candidates.entries()].sort(([a], [b]) => a - b);
    codeFindings.push({
      title: "The plan gives different deadlines",
      detail: `${listed
        .map(
          ([day, { quote }], i) =>
            `${i === 0 ? "One place says" : "Another says"} day ${day}: ${quoted(quote)}`,
        )
        .join(
          " ",
        )} It is not clear when everything must be done, so the review uses no deadline until the committee confirms one.`,
      quote: listed[0]![1].quote,
      severity: "blocker",
      source: "code",
      kind: "deadline_conflict",
      covers: listed.map(([, { span }]) => span),
    });
  } else if (candidates.size === 1) {
    const [[day, { quote }]] = [...candidates.entries()] as [
      [number, { quote: string; span: Span }],
    ];
    deadline_day = day;
    deadline_quote = modelVerified && answer.deadline_day === day ? answer.deadline_quote : quote;
  } else if (modelVerified) {
    deadline_day = answer.deadline_day;
    deadline_quote = answer.deadline_quote;
  } else {
    codeFindings.push({
      title: "No clear deadline",
      detail:
        "The plan does not say clearly by which day everything must be done, so the review cannot say whether it is on time.",
      quote: null,
      severity: "warning",
      source: "code",
      kind: "no_deadline",
      covers: [],
    });
  }

  // --- Schedule: cycles and lateness ---------------------------------------
  const tasks = answer.tasks;
  const nameOf = new Map(tasks.map((task) => [task.id, task.name]));
  const quoteOf = new Map(tasks.map((task) => [task.id, task.quote]));
  const graph = buildGraph(tasks);
  const groups = cyclicGroups(graph);
  const cycleFindings: CodeFinding[] = groups.map((group) => {
    const cycle = findCycle(graph, group).map((i) => graph.ids[i]!);
    const names = cycle.map((id) => quoted(nameOf.get(id)!));
    const detail =
      cycle.length === 1
        ? `${names[0]} waits for itself, so it can never start.`
        : `${names[0]} waits for ${names
            .slice(1)
            .map((name, i) => (i === 0 ? name : `which waits for ${name}`))
            .join(
              ", ",
            )}, which waits for ${names[0]}. None of them can start, so the plan cannot be scheduled until the committee says which comes first.`;
    return {
      title: "Tasks wait on each other in a circle",
      detail,
      quote: quoteOf.get(cycle[0]!)!,
      severity: "blocker",
      source: "code",
      kind: "cycle",
      // The tasks in the circle and the statements that link them.
      covers: [
        ...cycle.map((id) => spanOf(quoteOf.get(id)!)),
        ...answer.dependency_evidence
          .filter((e) => cycle.includes(e.task_id) && cycle.includes(e.waits_for_id))
          .map((e) => spanOf(e.quote)),
      ].filter((s): s is Span => s !== null),
      absorbs: ABOUT_A_CIRCLE,
    };
  });
  codeFindings.unshift(...cycleFindings);

  if (!groups.length && deadline_day !== null) {
    const result = scheduleTasks({ tasks, deadline_day });
    if (result.status === "scheduled" && !result.meets_deadline) {
      const { proof, end_day, days_late } = result;
      const opening = proof.optimal
        ? `The earliest the work can finish is day ${end_day}, ${days(days_late)} late.`
        : `The best schedule found finishes on day ${end_day}, ${days(days_late)} late, and no schedule can finish before day ${proof.lower_bound}.`;
      let reason = "";
      if (proof.bound.kind === "owner_workload") {
        reason = ` ${proof.bound.owner} has ${days(proof.bound.work_days)} of work and can only do one task at a time.`;
        if (proof.bound.earliest_start > 0)
          reason += ` None of it can start before day ${proof.bound.earliest_start}.`;
      } else if (proof.bound.kind === "dependency_chain") {
        const chain = proof.bound.task_ids.map((id) => nameOf.get(id)!).join(" → ");
        reason = ` The longest chain of tasks that wait on each other takes ${days(proof.lower_bound)}: ${chain}.`;
      }
      codeFindings.unshift({
        title: `Cannot finish by day ${deadline_day}`,
        detail: opening + reason,
        quote: deadline_quote,
        severity: "blocker",
        source: "code",
        kind: "late",
        covers: statements.map((s) => ({ start: s.start, end: s.end })),
      });
    }
  }

  // --- Instructions to the reviewer ----------------------------------------
  for (const instruction of instructions) {
    codeFindings.push({
      title: "The plan tries to direct the review",
      detail:
        "This text tells the reviewer what to report. It was ignored, and the plan was reviewed as written. Ask the committee why it is in the plan.",
      quote: instruction.quote,
      severity: "warning",
      source: "code",
      kind: "instructions",
      covers: [instruction],
    });
  }

  // --- Owners ---------------------------------------------------------------
  for (const task of tasks) {
    if (task.owner !== null) continue;
    codeFindings.push({
      title: `No owner for ${quoted(task.name)}`,
      detail:
        "Nobody is named for this task, so nobody is accountable for it. The schedule lets it run alongside other work, which may be optimistic.",
      quote: task.quote,
      severity: "warning",
      source: "code",
      kind: "no_owner",
      covers: [spanOf(task.quote)].filter((s): s is Span => s !== null),
      absorbs: ABOUT_AN_OWNER,
    });
  }
  const owners = [
    ...new Set(tasks.map((task) => task.owner).filter((o): o is string => o !== null)),
  ].sort((a, b) => a.length - b.length || a.localeCompare(b));
  owners.forEach((short, i) => {
    for (const long of owners.slice(i + 1)) {
      if (long.startsWith(`${short} `) || long.split(" ")[0] === short.split(" ")[0]) {
        codeFindings.push({
          title: "Two names may be the same person",
          detail: `${quoted(short)} and ${quoted(long)} are both listed as owners. If they are the same person, the schedule is too optimistic, because it lets them do two tasks at once.`,
          quote: null,
          severity: "warning",
          source: "code",
          kind: "owner_names",
          covers: [],
        });
      }
    }
  });

  // --- Merge ------------------------------------------------------------------
  const isDuplicate = (finding: (typeof answer.findings)[number]) => {
    const span = spanOf(finding.quote);
    if (!span) return false;
    const text = `${finding.title} ${finding.detail}`;
    return codeFindings.some(
      (code) =>
        code.covers.some((c) => overlaps(c, span)) && (!code.absorbs || code.absorbs.test(text)),
    );
  };
  // Sums of days and verdicts on the schedule are code's to state: the model
  // gets them wrong, and the page leads with the proven answer. Two nets: a
  // model finding that quotes the deadline code has settled is dropped
  // whatever it says, and so is one whose words state a sum or a verdict.
  const deadlineSpans: Span[] =
    deadline_day === null
      ? []
      : [...statements, spanOf(deadline_quote)].filter((s): s is Span => s !== null);
  const judgesTheSchedule = (finding: (typeof answer.findings)[number]) => {
    const span = spanOf(finding.quote);
    return (
      (!!span && deadlineSpans.some((d) => overlaps(d, span))) ||
      claimsScheduleVerdict(`${finding.title}. ${finding.detail}`)
    );
  };
  const modelFindings: ReviewFinding[] = answer.findings
    .filter((finding) => !judgesTheSchedule(finding))
    .filter((finding) => !isDuplicate(finding))
    .map((finding) => ({ ...finding, source: "model" as const, kind: "model" as const }));

  const findings: ReviewFinding[] = [
    ...codeFindings.map(({ covers: _covers, absorbs: _absorbs, ...finding }) => finding),
    ...modelFindings,
  ]
    .map((finding, order) => ({ finding, order }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] || a.order - b.order,
    )
    .map(({ finding }) => finding);

  const review: StoredReview = {
    deadline_day,
    tasks,
    findings,
    deadline_quote,
    deadline_statements: statements.map(({ day, quote }) => ({ day, quote })),
    dependency_evidence: answer.dependency_evidence,
    meta,
  };

  // Invariants: the result meets the contract and every quote is in the plan.
  const parsed = parseReview(review);
  if (!parsed.ok)
    throw new Error(`assembled review breaks the contract: ${parsed.errors.join("; ")}`);
  for (const quote of [...tasks.map((t) => t.quote), ...findings.map((f) => f.quote)]) {
    if (quote !== null && !locateQuote(plan, quote))
      throw new Error(`assembled review has an unverified quote: ${quote}`);
  }
  return review;
}
