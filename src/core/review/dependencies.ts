import type { ReviewTask } from "../contracts";

export type DependencyStatement = { quote: string; task: string; waits_for: string };
export type DependencyEvidence = { task_id: string; waits_for_id: string; quote: string };

export function resolveTaskName(_tasks: readonly ReviewTask[], _name: string): string | null {
  throw new Error("not implemented");
}

export function reconcileDependencies(
  _plan: string,
  _tasks: ReviewTask[],
  _statements: readonly DependencyStatement[],
  _options: { lastAttempt: boolean },
): { tasks: ReviewTask[]; errors: string[]; evidence: DependencyEvidence[] } {
  throw new Error("not implemented");
}
