// The two fixed formats from docs/contracts.md. Implementation pending (TDD).

export const MAX_TASKS = 60;

export type Task = {
  id: string;
  name: string;
  owner: string | null;
  duration_days: number;
  depends_on: string[];
};

export type ScheduleRequest = { tasks: Task[]; deadline_day: number };

export type ReviewTask = Task & { quote: string };
export type Finding = { title: string; detail: string; quote: string | null };
export type Review = { deadline_day: number | null; tasks: ReviewTask[]; findings: Finding[] };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseScheduleRequest(_input: unknown): ParseResult<ScheduleRequest> {
  throw new Error("not implemented");
}

export function parseReview(_input: unknown): ParseResult<Review> {
  throw new Error("not implemented");
}
