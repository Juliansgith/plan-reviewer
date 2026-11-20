// Response types for POST /api/schedule. The required fields follow
// docs/contracts.md exactly; `proof`, `critical_path` and `cycle_groups`
// are extra fields, which the contract allows.

export type ScheduledEntry = { id: string; start_day: number; end_day: number };

/** Why no schedule can end earlier than `lower_bound`. */
export type BoundReason =
  | { kind: "none" }
  | {
      /** These tasks depend on each other in a chain; their durations add up. */
      kind: "dependency_chain";
      task_ids: string[];
    }
  | {
      /** One person must do these tasks one at a time. */
      kind: "owner_workload";
      owner: string;
      task_ids: string[];
      /** None of these tasks can start before this day. */
      earliest_start: number;
      /** Sum of their durations. */
      work_days: number;
      /** At least this much dependent work must follow the last of them. */
      tail_days: number;
    };

export type ScheduleProof = {
  /** No valid schedule can end before this day. */
  lower_bound: number;
  bound: BoundReason;
  /** True when end_day is proven to be the smallest possible. */
  optimal: boolean;
  solver: {
    method: "bound_met_by_heuristic" | "branch_and_bound" | "best_found_within_limit";
    nodes: number;
    elapsed_ms: number;
  };
};

export type ScheduledResult = {
  status: "scheduled";
  schedule: ScheduledEntry[];
  end_day: number;
  deadline_day: number;
  meets_deadline: boolean;
  days_late: number;
  cycle: [];
  /** The chain of tasks that sets end_day, each starting as the previous one ends. */
  critical_path: string[];
  proof: ScheduleProof;
};

export type CycleResult = {
  status: "cycle";
  schedule: [];
  end_day: null;
  deadline_day: number;
  meets_deadline: null;
  days_late: null;
  /** One circular dependency, in order: each task depends on the next, the last on the first. */
  cycle: string[];
  /** Every group of tasks that wait on each other in a circle. */
  cycle_groups: string[][];
};

export type ScheduleResult = ScheduledResult | CycleResult;

export type SolveOptions = {
  /** Total time the solver may spend searching, in milliseconds. */
  timeLimitMs?: number;
  /** Upper limit on search nodes; keeps results reproducible across machines. */
  nodeLimit?: number;
};
