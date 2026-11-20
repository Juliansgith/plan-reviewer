// Turns a valid schedule request into the contract's response, with a proof
// of how good the answer is and the chain of tasks that sets the end day.

import type { ScheduleRequest } from "../contracts";
import { buildGraph, cyclicGroups, findCycle, type Graph } from "./graph";
import { solve, type Solution } from "./solve";
import type { BoundReason, ScheduleResult, ScheduledEntry, SolveOptions } from "./types";
import { verifyScheduleResponse } from "./verify";

export const DEFAULT_TIME_LIMIT_MS = 3_000;
export const DEFAULT_NODE_LIMIT = 5_000_000;

function boundReason(graph: Graph, solution: Solution): BoundReason {
  const { owner, chain } = solution;
  if (owner && owner.value > chain.value) {
    return {
      kind: "owner_workload",
      owner: graph.owners[owner.machine]!,
      task_ids: owner.members.map((i) => graph.ids[i]!),
      earliest_start: owner.earliestStart,
      work_days: owner.work,
      tail_days: owner.tail,
    };
  }
  if (chain.chain.length)
    return { kind: "dependency_chain", task_ids: chain.chain.map((i) => graph.ids[i]!) };
  return { kind: "none" };
}

/**
 * Walks back from the task that ends last: each step finds the dependency, or
 * else the same person's earlier task, that ends exactly when this one starts.
 */
function criticalPath(graph: Graph, start: readonly number[]): string[] {
  if (graph.n === 0) return [];
  const end = (i: number) => start[i]! + graph.duration[i]!;
  let current = 0;
  for (let i = 1; i < graph.n; i++) if (end(i) > end(current)) current = i;
  const path = [current];
  while (start[current]! > 0) {
    const s = start[current]!;
    const owner = graph.machine[current]!;
    let previous = graph.preds[current]!.find((p) => end(p) === s);
    if (previous === undefined && owner >= 0) {
      for (let i = 0; i < graph.n; i++) {
        if (i !== current && graph.machine[i] === owner && end(i) === s) {
          previous = i;
          break;
        }
      }
    }
    if (previous === undefined) break;
    path.unshift(previous);
    current = previous;
  }
  return path.map((i) => graph.ids[i]!);
}

export function scheduleTasks(
  request: ScheduleRequest,
  options: SolveOptions = {},
): ScheduleResult {
  const graph = buildGraph(request.tasks);
  const deadline_day = request.deadline_day;

  const groups = cyclicGroups(graph);
  if (groups.length) {
    return {
      status: "cycle",
      schedule: [],
      end_day: null,
      deadline_day,
      meets_deadline: null,
      days_late: null,
      cycle: findCycle(graph, groups[0]!).map((i) => graph.ids[i]!),
      cycle_groups: groups.map((group) => group.map((i) => graph.ids[i]!)),
    };
  }

  const solution = solve(graph, {
    timeLimitMs: options.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS,
    nodeLimit: options.nodeLimit ?? DEFAULT_NODE_LIMIT,
  });
  const schedule: ScheduledEntry[] = request.tasks.map((task, i) => ({
    id: task.id,
    start_day: solution.start[i]!,
    end_day: solution.start[i]! + task.duration_days,
  }));
  const end_day = schedule.reduce((max, entry) => Math.max(max, entry.end_day), 0);

  const result: ScheduleResult = {
    status: "scheduled",
    schedule,
    end_day,
    deadline_day,
    meets_deadline: end_day <= deadline_day,
    days_late: Math.max(0, end_day - deadline_day),
    cycle: [],
    critical_path: criticalPath(graph, solution.start),
    proof: {
      lower_bound: solution.lowerBound,
      bound: boundReason(graph, solution),
      optimal: solution.optimal,
      solver: { method: solution.method, nodes: solution.nodes },
    },
  };

  // Belt and braces: every answer is checked by an independent verifier (the
  // port of check_contract.py) before it leaves the engine.
  const problems = verifyScheduleResponse(request, result);
  if (problems.length)
    throw new Error(`scheduler produced an invalid schedule: ${problems.join("; ")}`);
  return result;
}
