import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ScheduleRequest, Task } from "../contracts";
import { scheduleTasks } from "./schedule";
import type { ScheduledResult } from "./types";
import { verifyScheduleResponse } from "./verify";

const t = (id: string, duration_days: number, depends_on: string[] = [], owner: string | null = null): Task => ({
  id,
  name: `Task ${id}`,
  owner,
  duration_days,
  depends_on,
});

function scheduled(request: ScheduleRequest): ScheduledResult {
  const result = scheduleTasks(request);
  expect(verifyScheduleResponse(request, result)).toEqual([]);
  if (result.status !== "scheduled") throw new Error(`expected a schedule, got ${result.status}`);
  return result;
}

describe("scheduleTasks: schedules", () => {
  it("solves the contract's example in 9 days, which is optimal", () => {
    const request = JSON.parse(
      readFileSync(new URL("../../../examples/schedule-request.json", import.meta.url), "utf8"),
    ) as ScheduleRequest;
    const result = scheduled(request);
    expect(result).toMatchObject({ end_day: 9, deadline_day: 10, meets_deadline: true, days_late: 0, cycle: [] });
    expect(result.proof).toMatchObject({ lower_bound: 9, optimal: true });
  });

  it("returns an empty schedule that ends on day 0", () => {
    const result = scheduled({ tasks: [], deadline_day: 5 });
    expect(result).toMatchObject({ schedule: [], end_day: 0, meets_deadline: true, days_late: 0 });
    expect(result.proof.optimal).toBe(true);
  });

  it("lists every task once, in the order of the request", () => {
    const result = scheduled({ tasks: [t("B", 1), t("A", 1), t("C", 1, ["A"])], deadline_day: 5 });
    expect(result.schedule.map((entry) => entry.id)).toEqual(["B", "A", "C"]);
  });

  it("makes one person do one task at a time", () => {
    const result = scheduled({ tasks: [t("A", 3, [], "Ann"), t("B", 3, [], "Ann")], deadline_day: 10 });
    expect(result.end_day).toBe(6);
  });

  it("runs tasks with no owner in parallel", () => {
    const result = scheduled({ tasks: [t("A", 3), t("B", 3)], deadline_day: 10 });
    expect(result.end_day).toBe(3);
  });

  it("treats different owners as different people", () => {
    const result = scheduled({ tasks: [t("A", 3, [], "Ann"), t("B", 3, [], "Bob")], deadline_day: 10 });
    expect(result.end_day).toBe(3);
  });

  it("reports lateness against the deadline", () => {
    const late = scheduled({ tasks: [t("A", 4), t("B", 3, ["A"])], deadline_day: 5 });
    expect(late).toMatchObject({ end_day: 7, meets_deadline: false, days_late: 2 });
    const exact = scheduled({ tasks: [t("A", 5)], deadline_day: 5 });
    expect(exact).toMatchObject({ meets_deadline: true, days_late: 0 });
  });

  it("explains a dependency chain bound and names the chain", () => {
    const result = scheduled({
      tasks: [t("A", 2), t("B", 5, ["A"]), t("C", 1, ["B"]), t("D", 1)],
      deadline_day: 10,
    });
    expect(result.end_day).toBe(8);
    expect(result.proof.bound).toEqual({ kind: "dependency_chain", task_ids: ["A", "B", "C"] });
    expect(result.critical_path).toEqual(["A", "B", "C"]);
  });

  it("explains an owner bound: Ruth's work alone takes longer than any chain", () => {
    const ruth = ["R1", "R2", "R3", "R4"].map((id) => t(id, 5, [], "Ruth"));
    const result = scheduled({ tasks: [...ruth, t("X", 7)], deadline_day: 15 });
    expect(result).toMatchObject({ end_day: 20, days_late: 5 });
    expect(result.proof).toMatchObject({ lower_bound: 20, optimal: true });
    expect(result.proof.bound).toMatchObject({
      kind: "owner_workload",
      owner: "Ruth",
      earliest_start: 0,
      work_days: 20,
      tail_days: 0,
    });
    expect(result.critical_path).toHaveLength(4);
  });

  it("does better than greedy longest-chain-first on a case where that rule fails", () => {
    // Ann can do A (5 days) or B (1 day) first. B unblocks Bob's 6-day task,
    // so B must go first: B 0-1, A 1-6, C 1-7 ends on day 7. Starting with
    // the longer A ends on day 12.
    const result = scheduled({
      tasks: [t("A", 5, [], "Ann"), t("B", 1, [], "Ann"), t("C", 6, ["B"], "Bob")],
      deadline_day: 7,
    });
    expect(result.end_day).toBe(7);
    expect(result.proof.optimal).toBe(true);
  });

  it("gives the same answer every time", () => {
    const request: ScheduleRequest = {
      tasks: [t("A", 3, [], "Ann"), t("B", 2, ["A"], "Bob"), t("C", 4, [], "Ann"), t("D", 2, ["C"], "Bob")],
      deadline_day: 10,
    };
    expect(scheduleTasks(request)).toEqual(scheduleTasks(request));
  });

  it("finishes a 60-task layered graph quickly (the starter took ~30 minutes)", () => {
    const tasks: Task[] = [];
    for (let layer = 0; layer < 30; layer++) {
      const previous = layer === 0 ? [] : [`L${layer - 1}a`, `L${layer - 1}b`];
      tasks.push(t(`L${layer}a`, 1, previous), t(`L${layer}b`, 1, previous));
    }
    const started = performance.now();
    const result = scheduled({ tasks, deadline_day: 99 });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.end_day).toBe(30);
  });

  it("handles a 1,500-task chain without overflowing the stack", () => {
    // The API caps requests at 60 tasks, but the engine itself must not
    // depend on recursion depth.
    const tasks = Array.from({ length: 1500 }, (_, i) => t(`C${i}`, 1, i === 0 ? [] : [`C${i - 1}`]));
    const result = scheduleTasks({ tasks, deadline_day: 10 });
    expect(result).toMatchObject({ status: "scheduled", end_day: 1500 });
  });
});

describe("scheduleTasks: cycles", () => {
  it("answers the contract's two-task cycle", () => {
    const request = { tasks: [t("A", 1, ["B"]), t("B", 1, ["A"])], deadline_day: 10 };
    const result = scheduleTasks(request);
    expect(verifyScheduleResponse(request, result)).toEqual([]);
    expect(result).toMatchObject({
      status: "cycle",
      schedule: [],
      end_day: null,
      meets_deadline: null,
      days_late: null,
      deadline_day: 10,
    });
    if (result.status === "cycle") expect([...result.cycle].sort()).toEqual(["A", "B"]);
  });

  it("treats a task that depends on itself as a cycle", () => {
    const result = scheduleTasks({ tasks: [t("A", 1, ["A"])], deadline_day: 3 });
    expect(result).toMatchObject({ status: "cycle", cycle: ["A"] });
  });

  it("orders the cycle so each task depends on the next", () => {
    const request = { tasks: [t("A", 1, ["C"]), t("B", 1, ["A"]), t("C", 1, ["B"]), t("D", 1, ["A"])], deadline_day: 9 };
    const result = scheduleTasks(request);
    if (result.status !== "cycle") throw new Error("expected a cycle");
    const byId = new Map(request.tasks.map((task) => [task.id, task]));
    result.cycle.forEach((id, index) => {
      const next = result.cycle[(index + 1) % result.cycle.length];
      expect(byId.get(id)?.depends_on).toContain(next);
    });
    expect(result.cycle).not.toContain("D");
    expect(verifyScheduleResponse(request, result)).toEqual([]);
  });

  it("lists every separate circle in cycle_groups", () => {
    const result = scheduleTasks({
      tasks: [t("A", 1, ["B"]), t("B", 1, ["A"]), t("C", 1, ["D"]), t("D", 1, ["C"]), t("E", 1)],
      deadline_day: 3,
    });
    if (result.status !== "cycle") throw new Error("expected a cycle");
    const groups = result.cycle_groups.map((group) => [...group].sort().join(",")).sort();
    expect(groups).toEqual(["A,B", "C,D"]);
  });
});
