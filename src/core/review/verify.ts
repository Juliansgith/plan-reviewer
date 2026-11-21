// Checks a review that came from somewhere else (a file on disk, or the
// review server) against the plan it claims to review: every quote must be
// in the plan, and the deadline must be one the plan states, outside any text
// aimed at the reviewer. The page runs this on every stored review it loads,
// and ./review runs it on every review the server sends back.

import type { Review } from "../contracts";
import { locateQuote } from "../text";
import { findDeadlineStatements, findInstructionsToReviewer, quoteStatesDay } from "./signals";

const short = (text: string) => (text.length > 80 ? `${text.slice(0, 77)}...` : text);

/** The problems with the review, in plain words; empty when it holds. */
export function checkReviewAgainstPlan(plan: string, review: Review): string[] {
  const problems: string[] = [];
  for (const task of review.tasks) {
    if (!locateQuote(plan, task.quote))
      problems.push(`Task ${task.id}: the quote "${short(task.quote)}" is not in the plan.`);
  }
  review.findings.forEach((finding, i) => {
    if (finding.quote !== null && !locateQuote(plan, finding.quote)) {
      problems.push(`Finding ${i + 1}: the quote "${short(finding.quote)}" is not in the plan.`);
    }
  });

  if (review.deadline_day !== null) {
    const deadlineQuote = typeof review.deadline_quote === "string" ? review.deadline_quote : null;
    const statements = findDeadlineStatements(plan);
    const stated = statements.some((s) => s.day === review.deadline_day);
    const quoteSpan = deadlineQuote ? locateQuote(plan, deadlineQuote) : null;
    const quoted =
      !!quoteSpan &&
      quoteStatesDay(deadlineQuote!, review.deadline_day) &&
      !findInstructionsToReviewer(plan).some(
        (i) => i.start < quoteSpan.end && quoteSpan.start < i.end,
      );
    if (!stated && !quoted) {
      const days = [...new Set(statements.map((s) => s.day))];
      problems.push(
        `The review's deadline, day ${review.deadline_day}, is not a deadline the plan states${
          days.length ? ` (the plan states ${days.map((d) => `day ${d}`).join(" and ")})` : ""
        }.`,
      );
    }
  }
  return problems;
}
