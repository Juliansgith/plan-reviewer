// A deliberately simple reference solver for tests: it tries every order of
// the tasks that respects dependencies, places each task as early as its
// dependencies and its owner allow, and keeps the best end day.
//
// Sorting any valid schedule by start day gives an order this procedure turns
// into a schedule that is no later, so the minimum over all orders is the true
// optimum. It is exponential and only meant for small instances (<= 8 tasks).
// It shares no code with the real solver, so the two can check each other.

import type { Task } from "../core/contracts";

export function bruteForceEndDay(tasks: readonly Task[]): number {
  if (tasks.length > 8) throw new Error("reference solver is limited to 8 tasks");
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let best = Number.POSITIVE_INFINITY;

  const finish = new Map<string, number>();
  const ownerFree = new Map<string, number>();

  function visit(placed: number, endSoFar: number) {
    if (endSoFar >= best) return;
    if (placed === tasks.length) {
      best = endSoFar;
      return;
    }
    for (const task of tasks) {
      if (finish.has(task.id)) continue;
      if (!task.depends_on.every((dep) => finish.has(dep))) continue;
      const ready = Math.max(0, ...task.depends_on.map((dep) => finish.get(dep) ?? 0));
      const start = task.owner === null ? ready : Math.max(ready, ownerFree.get(task.owner) ?? 0);
      const end = start + task.duration_days;
      const previousFree = task.owner === null ? undefined : ownerFree.get(task.owner);
      finish.set(task.id, end);
      if (task.owner !== null) ownerFree.set(task.owner, end);
      visit(placed + 1, Math.max(endSoFar, end));
      finish.delete(task.id);
      if (task.owner !== null) {
        if (previousFree === undefined) ownerFree.delete(task.owner);
        else ownerFree.set(task.owner, previousFree);
      }
    }
  }

  for (const task of tasks) {
    for (const dep of task.depends_on) {
      if (!byId.has(dep)) throw new Error(`unknown dependency ${dep}`);
    }
  }
  visit(0, 0);
  return best;
}
