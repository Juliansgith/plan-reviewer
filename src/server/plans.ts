// Reads plans and their stored reviews from disk and prepares what the page
// and the API show.
//
// Trust nothing on disk: only ids found in the plans folder are served (so a
// path such as ..\..\secret never reaches the file system), and every stored
// review is verified again on load against the contract, the plan's text and
// the plan's own deadline statements. A review that fails is reported with
// its problems and is not shown as if it were right.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReview, type ReviewTask } from "../core/contracts";
import { findDeadlineStatements } from "../core/review/signals";
import type { FindingKind, ReviewFinding, Severity, StoredReview } from "../core/review/types";
import { checkReviewAgainstPlan } from "../core/review/verify";
import { scheduleTasks } from "../core/schedule/schedule";
import type { ScheduleResult } from "../core/schedule/types";
import { locateQuote, type Span } from "../core/text";

export type VerdictStatus =
  "on_time" | "late" | "cycle" | "no_deadline" | "not_reviewed" | "review_invalid";

export type Verdict = {
  status: VerdictStatus;
  end_day: number | null;
  deadline_day: number | null;
  days_late: number | null;
  tasks: number;
  blockers: number;
};

export type PlanSummary = { id: string; title: string; verdict: Verdict };

/** A verified review as the page uses it. Fields our own ./review adds may be missing from reviews written elsewhere. */
export type ViewReview = {
  deadline_day: number | null;
  deadline_quote: string | null;
  tasks: ReviewTask[];
  findings: ReviewFinding[];
  meta: StoredReview["meta"] | null;
};

export type PlanView = PlanSummary & {
  text: string;
  review: ViewReview | null;
  problems: string[];
  quotes: {
    tasks: Record<string, Span | null>;
    findings: (Span | null)[];
    deadline: Span | null;
  };
  /** Every deadline day the plan's text states, for plans without one clear deadline. */
  deadlineCandidates: number[];
  schedule: ScheduleResult | null;
};

const ID = /^[a-z0-9][a-z0-9-]*$/;
const SEVERITIES = new Set<Severity>(["blocker", "warning", "note"]);
const KINDS = new Set<FindingKind>([
  "model",
  "cycle",
  "late",
  "deadline_conflict",
  "no_deadline",
  "instructions",
  "no_owner",
  "owner_names",
]);

function readReview(file: string, plan: string): { review: ViewReview | null; problems: string[] } {
  if (!existsSync(file)) {
    return {
      review: null,
      problems: ["This plan has not been reviewed yet. Run ./review to create a review."],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return {
      review: null,
      problems: [`The stored review is not valid JSON: ${(error as Error).message}`],
    };
  }
  const parsed = parseReview(raw);
  if (!parsed.ok)
    return {
      review: null,
      problems: parsed.errors.map((e) => `The stored review breaks the contract: ${e}`),
    };
  const stored = parsed.value;

  const problems = checkReviewAgainstPlan(plan, stored);
  if (problems.length) return { review: null, problems };
  const deadlineQuote = typeof stored.deadline_quote === "string" ? stored.deadline_quote : null;

  const findings: ReviewFinding[] = stored.findings.map((finding) => ({
    title: finding.title,
    detail: finding.detail,
    quote: finding.quote,
    severity: SEVERITIES.has(finding.severity as Severity)
      ? (finding.severity as Severity)
      : "warning",
    source: finding.source === "code" ? "code" : "model",
    kind: KINDS.has(finding.kind as FindingKind) ? (finding.kind as FindingKind) : "model",
    ...(finding.quote_removed === true && { quote_removed: true as const }),
  }));
  return {
    review: {
      deadline_day: stored.deadline_day,
      deadline_quote: deadlineQuote,
      tasks: stored.tasks,
      findings,
      meta: (stored.meta as StoredReview["meta"] | undefined) ?? null,
    },
    problems,
  };
}

function verdictOf(
  review: ViewReview | null,
  problems: string[],
  schedule: ScheduleResult | null,
): Verdict {
  const empty = { end_day: null, deadline_day: null, days_late: null, tasks: 0, blockers: 0 };
  if (!review || !schedule) {
    return {
      status: problems[0]?.startsWith("This plan has not been reviewed")
        ? "not_reviewed"
        : "review_invalid",
      ...empty,
    };
  }
  const base = {
    tasks: review.tasks.length,
    blockers: review.findings.filter((f) => f.severity === "blocker").length,
    deadline_day: review.deadline_day,
  };
  if (schedule.status === "cycle")
    return { status: "cycle", end_day: null, days_late: null, ...base };
  if (review.deadline_day === null)
    return { status: "no_deadline", end_day: schedule.end_day, days_late: null, ...base };
  return {
    status: schedule.meets_deadline ? "on_time" : "late",
    end_day: schedule.end_day,
    days_late: schedule.days_late,
    ...base,
  };
}

export function createPlanRepository(dataDir: string) {
  const plansDir = join(dataDir, "plans");
  const reviewsDir = join(dataDir, "reviews");

  const ids = (): string[] =>
    existsSync(plansDir)
      ? readdirSync(plansDir)
          .filter((file) => file.endsWith(".md"))
          .map((file) => file.slice(0, -3))
          .filter((id) => ID.test(id))
      : [];

  function get(id: string): PlanView | null {
    if (!ids().includes(id)) return null;
    const text = readFileSync(join(plansDir, `${id}.md`), "utf8");
    const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? id;
    const { review, problems } = readReview(join(reviewsDir, `${id}.json`), text);
    const schedule = review
      ? scheduleTasks({ tasks: review.tasks, deadline_day: review.deadline_day ?? 0 })
      : null;
    return {
      id,
      title,
      text,
      review,
      problems,
      schedule,
      verdict: verdictOf(review, problems, schedule),
      quotes: {
        tasks: Object.fromEntries(
          (review?.tasks ?? []).map((task) => [task.id, locateQuote(text, task.quote)]),
        ),
        findings: (review?.findings ?? []).map((finding) =>
          finding.quote ? locateQuote(text, finding.quote) : null,
        ),
        deadline: review?.deadline_quote ? locateQuote(text, review.deadline_quote) : null,
      },
      deadlineCandidates: [...new Set(findDeadlineStatements(text).map((s) => s.day))].sort(
        (a, b) => a - b,
      ),
    };
  }

  function list(): PlanSummary[] {
    return ids()
      .map((id) => get(id)!)
      .map(({ id, title, verdict }) => ({ id, title, verdict }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  return { list, get };
}

export type PlanRepository = ReturnType<typeof createPlanRepository>;
