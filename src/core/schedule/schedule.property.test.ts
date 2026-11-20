// Property tests: thousands of random plans, checked against the contract
// verifier and against an independent brute-force solver.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bruteForceEndDay } from "../../test/reference-scheduler";
import type { ScheduleRequest, Task } from "../contracts";
import { scheduleTasks } from "./schedule";
import { verifyScheduleResponse } from "./verify";

const OWNERS = ["Ann", "Bob", "Cy", null] as const;

/** A random plan with no cycles: a task may only depend on earlier tasks. */
function acyclicRequest(maxTasks: number) {
  return fc.integer({ min: 0, max: maxTasks }).chain((n) =>
    fc
      .record({
        owners: fc.array(fc.constantFrom(...OWNERS), { minLength: n, maxLength: n }),
        durations: fc.array(fc.integer({ min: 1, max: 8 }), { minLength: n, maxLength: n }),
        edges: fc.array(fc.integer({ min: 0, max: 9 }), {
          minLength: (n * (n - 1)) / 2,
          maxLength: (n * (n - 1)) / 2,
        }),
        deadline: fc.integer({ min: 0, max: 40 }),
        order: fc.shuffledSubarray(
          Array.from({ length: n }, (_, i) => i),
          { minLength: n, maxLength: n },
        ),
      })
      .map(({ owners, durations, edges, deadline, order }): ScheduleRequest => {
        const tasks: Task[] = [];
        let edge = 0;
        for (let i = 0; i < n; i++) {
          const depends_on: string[] = [];
          for (let j = 0; j < i; j++) if ((edges[edge++] ?? 9) < 3) depends_on.push(`T${j}`);
          tasks.push({ id: `T${i}`, name: `Task ${i}`, owner: owners[i] ?? null, duration_days: durations[i] ?? 1, depends_on });
        }
        // Present the tasks in a random order so the solver cannot rely on it.
        return { tasks: order.map((i) => tasks[i]!), deadline_day: deadline };
      }),
  );
}

describe("scheduler properties", () => {
  it("always returns a schedule that passes the contract verifier", () => {
    fc.assert(
      fc.property(acyclicRequest(25), (request) => {
        const result = scheduleTasks(request, { timeLimitMs: 200 });
        expect(result.status).toBe("scheduled");
        expect(verifyScheduleResponse(request, result)).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it("never claims a lower bound above its own end day", () => {
    fc.assert(
      fc.property(acyclicRequest(25), (request) => {
        const result = scheduleTasks(request, { timeLimitMs: 200 });
        if (result.status !== "scheduled") throw new Error("expected a schedule");
        expect(result.proof.lower_bound).toBeLessThanOrEqual(result.end_day);
        if (result.proof.optimal) expect(result.proof.lower_bound === result.end_day || result.proof.solver.method === "branch_and_bound").toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("finds the true optimum on small plans, and its lower bound is never above it", () => {
    fc.assert(
      fc.property(acyclicRequest(7), (request) => {
        const result = scheduleTasks(request);
        if (result.status !== "scheduled") throw new Error("expected a schedule");
        const optimum = bruteForceEndDay(request.tasks);
        expect(result.end_day).toBe(optimum);
        expect(result.proof.optimal).toBe(true);
        expect(result.proof.lower_bound).toBeLessThanOrEqual(optimum);
      }),
      { numRuns: 400 },
    );
  });

  it("finds a cycle whenever one exists, and only ids that lie on it", () => {
    const withCycle = acyclicRequest(10)
      .filter((request) => request.tasks.length >= 2)
      .chain((request) =>
        fc
          .tuple(
            fc.integer({ min: 0, max: request.tasks.length - 1 }),
            fc.integer({ min: 0, max: request.tasks.length - 1 }),
          )
          .map(([a, b]) => {
            const tasks = request.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on] }));
            const first = tasks[a]!;
            const second = tasks[b]!;
            first.depends_on.push(second.id);
            if (a !== b) second.depends_on.push(first.id);
            return { ...request, tasks };
          }),
      );
    fc.assert(
      fc.property(withCycle, (request) => {
        const result = scheduleTasks(request);
        expect(result.status).toBe("cycle");
        expect(verifyScheduleResponse(request, result)).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it("answers 60-task plans with up to 6 owners within the time limit", () => {
    const owners = ["A", "B", "C", "D", "E", "F", null] as const;
    const big = fc
      .record({
        owners: fc.array(fc.constantFrom(...owners), { minLength: 60, maxLength: 60 }),
        durations: fc.array(fc.integer({ min: 1, max: 15 }), { minLength: 60, maxLength: 60 }),
        density: fc.integer({ min: 1, max: 15 }),
        seed: fc.integer(),
      })
      .map(({ owners: taskOwners, durations, density, seed }): ScheduleRequest => {
        let state = seed >>> 0;
        const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
        const tasks: Task[] = taskOwners.map((owner, i) => ({
          id: `T${i}`,
          name: `Task ${i}`,
          owner,
          duration_days: durations[i] ?? 1,
          depends_on: Array.from({ length: i }, (_, j) => j)
            .filter(() => random() < density / 100)
            .map((j) => `T${j}`),
        }));
        return { tasks, deadline_day: 60 };
      });
    fc.assert(
      fc.property(big, (request) => {
        const started = performance.now();
        const result = scheduleTasks(request, { timeLimitMs: 1500 });
        const elapsed = performance.now() - started;
        expect(elapsed).toBeLessThan(3000);
        expect(verifyScheduleResponse(request, result)).toEqual([]);
      }),
      { numRuns: 12 },
    );
  }, 60_000);
});
