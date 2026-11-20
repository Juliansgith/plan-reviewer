// The model lists every "X waits for Y" statement in the plan, with its
// exact quote, before it writes the tasks. Code then checks the two agree:
// a verified statement whose task does not depend on what it says goes back
// to the model, and on the last attempt code adds the dependency itself, but
// only when both task names match one task each.
//
// Why: dependencies stated only in the notes are the easiest thing for a
// model to miss, and the Harbour Run circle hides in one (docs/DECISIONS.md).

import type { ReviewTask } from "../contracts";
import { verifiedQuote } from "../text";

export type DependencyStatement = { quote: string; task: string; waits_for: string };
export type DependencyEvidence = { task_id: string; waits_for_id: string; quote: string };

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The id of the one task this name refers to, or null when it is unclear. */
export function resolveTaskName(tasks: readonly ReviewTask[], name: string): string | null {
  const wanted = normalise(name);
  if (!wanted) return null;
  const exact = tasks.filter((task) => normalise(task.name) === wanted);
  if (exact.length) return exact.length === 1 ? exact[0]!.id : null;
  const partial = tasks.filter((task) => {
    const candidate = normalise(task.name);
    return candidate.includes(wanted) || wanted.includes(candidate);
  });
  return partial.length === 1 ? partial[0]!.id : null;
}

export function reconcileDependencies(
  plan: string,
  tasks: ReviewTask[],
  statements: readonly DependencyStatement[],
  { lastAttempt }: { lastAttempt: boolean },
): { tasks: ReviewTask[]; errors: string[]; evidence: DependencyEvidence[] } {
  const updated = tasks.map((task) => ({ ...task, depends_on: [...task.depends_on] }));
  const byId = new Map(updated.map((task) => [task.id, task]));
  const errors: string[] = [];
  const evidence: DependencyEvidence[] = [];

  statements.forEach((statement, index) => {
    const quote = verifiedQuote(plan, statement.quote);
    if (quote === null) {
      if (!lastAttempt) {
        errors.push(
          `dependency_statements[${index}] quote is not in the plan: "${statement.quote}". Copy the exact words from the plan.`,
        );
      }
      return;
    }
    const taskId = resolveTaskName(updated, statement.task);
    const waitsForId = resolveTaskName(updated, statement.waits_for);
    if (!taskId || !waitsForId || taskId === waitsForId) return;

    const task = byId.get(taskId)!;
    if (!task.depends_on.includes(waitsForId)) {
      if (!lastAttempt) {
        errors.push(
          `dependency_statements[${index}] says "${statement.task}" waits for "${statement.waits_for}" ("${quote}"), but task ${taskId} does not depend on ${waitsForId}. Add ${waitsForId} to the depends_on of ${taskId}, or remove the statement if it is wrong.`,
        );
        return;
      }
      task.depends_on.push(waitsForId);
    }
    evidence.push({ task_id: taskId, waits_for_id: waitsForId, quote });
  });

  return { tasks: lastAttempt ? updated : tasks.map((t) => byId.get(t.id)!), errors, evidence };
}
