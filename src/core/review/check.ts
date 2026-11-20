// Checks one model answer and turns it into a typed, verified answer, or into
// errors the model can act on in a repair round.

import { z } from "zod";
import { formatPath, parseReview, type ReviewTask } from "../contracts";
import { collapseWhitespace, locateQuote, locateQuoteIgnoringEmphasis } from "../text";
import type { Severity } from "./types";

export type ModelFinding = {
  title: string;
  detail: string;
  quote: string | null;
  severity: Severity;
  quote_removed?: true;
};

export type CheckedAnswer = {
  deadline_day: number | null;
  deadline_quote: string | null;
  tasks: ReviewTask[];
  findings: ModelFinding[];
};

const ModelAnswerSchema = z.looseObject({
  deadline_day: z.int({ error: "must be a whole number or null" }).nullable(),
  deadline_quote: z.string().nullable(),
  tasks: z.array(
    z.looseObject({
      id: z.string().min(1),
      name: z.string(),
      owner: z.string().nullable(),
      duration_days: z
        .int({ error: "must be a whole number of days, at least 1" })
        .min(1, { error: "must be a whole number of days, at least 1" }),
      depends_on: z.array(z.string()),
      quote: z.string(),
    }),
  ),
  findings: z.array(
    z.looseObject({
      title: z.string().min(1),
      detail: z.string(),
      quote: z.string().nullable(),
      severity: z.enum(["blocker", "warning", "note"]).catch("warning"),
    }),
  ),
});

/** Parses the model's text as JSON, tolerating a code fence or text around it. */
export function parseModelJson(
  content: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  let text = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fenced) text = fenced[1]!;
  else if (!text.startsWith("{")) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) text = text.slice(first, last + 1);
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      error: `The answer was not valid JSON (${(error as Error).message}). Return only the JSON object.`,
    };
  }
}

const NO_OWNER = /^(?:tbc|tba|tbd|unknown|n\/?a|none|nobody|no one|-+|—|\?+)$/i;

/** Returns the quote as it should be stored, or null if it is not in the plan. */
function verifiedQuote(plan: string, quote: string): string | null {
  const trimmed = collapseWhitespace(quote).trim();
  if (locateQuote(plan, trimmed)) return trimmed;
  return locateQuoteIgnoringEmphasis(plan, trimmed)?.quote ?? null;
}

export function checkAnswer(
  plan: string,
  value: unknown,
  { lastAttempt }: { lastAttempt: boolean },
): { ok: true; answer: CheckedAnswer } | { ok: false; errors: string[] } {
  const shape = ModelAnswerSchema.safeParse(value);
  if (!shape.success) {
    return {
      ok: false,
      errors: shape.error.issues.map(
        (issue) => `${formatPath(issue.path) || "answer"} ${issue.message}`,
      ),
    };
  }
  const errors: string[] = [];
  const raw = shape.data;

  const tasks: ReviewTask[] = raw.tasks.map((task, index) => {
    const owner =
      task.owner === null || NO_OWNER.test(task.owner.trim()) || !task.owner.trim()
        ? null
        : task.owner.trim();
    const quote = verifiedQuote(plan, task.quote);
    if (quote === null) {
      errors.push(
        `tasks[${index}] (${task.id}) quote is not in the plan: "${task.quote}". Copy the exact words from the plan.`,
      );
    }
    return {
      id: task.id.trim(),
      name: task.name.trim(),
      owner,
      duration_days: task.duration_days,
      depends_on: task.depends_on.map((id) => id.trim()),
      quote: quote ?? task.quote,
    };
  });

  const findings: ModelFinding[] = raw.findings.map((finding, index) => {
    const base = {
      title: finding.title.trim(),
      detail: finding.detail.trim(),
      severity: finding.severity,
    };
    if (finding.quote === null || !finding.quote.trim()) return { ...base, quote: null };
    const quote = verifiedQuote(plan, finding.quote);
    if (quote !== null) return { ...base, quote };
    if (lastAttempt) return { ...base, quote: null, quote_removed: true };
    errors.push(
      `findings[${index}] ("${finding.title}") quote is not in the plan: "${finding.quote}". Copy the exact words from the plan, or use null.`,
    );
    return { ...base, quote: finding.quote };
  });

  let deadline_quote: string | null = null;
  if (raw.deadline_quote !== null && raw.deadline_quote.trim()) {
    deadline_quote = verifiedQuote(plan, raw.deadline_quote);
    if (deadline_quote === null && !lastAttempt) {
      errors.push(
        `deadline_quote is not in the plan: "${raw.deadline_quote}". Copy the exact words from the plan, or use null.`,
      );
    }
  }

  const graph = parseReview({ deadline_day: raw.deadline_day, tasks, findings: [] });
  if (!graph.ok) errors.push(...graph.errors);

  if (errors.length) return { ok: false, errors };
  return { ok: true, answer: { deadline_day: raw.deadline_day, deadline_quote, tasks, findings } };
}
