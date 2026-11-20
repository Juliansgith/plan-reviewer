import type { Span } from "../core/text";
import type { ScheduleResult } from "../core/schedule/types";
import type { StoredReview } from "../core/review/types";

export type VerdictStatus = "on_time" | "late" | "cycle" | "no_deadline" | "not_reviewed" | "review_invalid";

export type PlanSummary = {
  id: string;
  title: string;
  verdict: {
    status: VerdictStatus;
    end_day: number | null;
    deadline_day: number | null;
    days_late: number | null;
    tasks: number;
    blockers: number;
  };
};

export type PlanView = PlanSummary & {
  text: string;
  review: StoredReview | null;
  problems: string[];
  quotes: { tasks: Record<string, Span | null>; findings: (Span | null)[] };
  schedule: ScheduleResult | null;
};

export function createPlanRepository(_dataDir: string): { list(): PlanSummary[]; get(id: string): PlanView | null } {
  throw new Error("not implemented");
}
