import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ReviewTask } from "../contracts";
import { reconcileDependencies, resolveTaskName } from "./dependencies";

const plan = readFileSync(new URL("../../../data/plans/harbour-run.md", import.meta.url), "utf8");

const task = (id: string, name: string, depends_on: string[] = []): ReviewTask => ({
  id,
  name,
  owner: "Dan",
  duration_days: 1,
  depends_on,
  quote: name,
});

const tasks = [
  task("T1", "Measure and map the course"),
  task("T2", "Get the course approved by the council", ["T1", "T3"]),
  task("T3", "Take out the event insurance"),
];

const insuranceWaits = {
  quote:
    "Kerry will take out the event insurance once the council has approved the course, because the insurers want a copy of the approved course map before they will cover us.",
  task: "take out the event insurance",
  waits_for: "get the course approved",
};

describe("resolveTaskName", () => {
  it("matches exact names, then a unique partial match, ignoring case and punctuation", () => {
    expect(resolveTaskName(tasks, "Take out the event insurance.")).toBe("T3");
    expect(resolveTaskName(tasks, "course approved")).toBe("T2");
    expect(resolveTaskName(tasks, "the event insurance")).toBe("T3");
  });

  it("refuses to guess when the name is ambiguous or unknown", () => {
    expect(resolveTaskName(tasks, "the course")).toBeNull();
    expect(resolveTaskName(tasks, "Book the brass band")).toBeNull();
  });
});

describe("reconcileDependencies", () => {
  it("asks for a stated dependency that the task list leaves out", () => {
    const result = reconcileDependencies(plan, tasks, [insuranceWaits], { lastAttempt: false });
    expect(result.tasks).toEqual(tasks);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('"take out the event insurance" waits for "get the course approved"');
    expect(result.errors[0]).toContain("T3");
    expect(result.errors[0]).toContain("T2");
  });

  it("adds it itself on the last attempt, because the quote is verified and the names are clear", () => {
    const result = reconcileDependencies(plan, tasks, [insuranceWaits], { lastAttempt: true });
    expect(result.errors).toEqual([]);
    expect(result.tasks.find((t) => t.id === "T3")!.depends_on).toEqual(["T2"]);
  });

  it("records verified evidence for each dependency it could place", () => {
    const result = reconcileDependencies(plan, tasks, [insuranceWaits], { lastAttempt: true });
    expect(result.evidence).toEqual([{ task_id: "T3", waits_for_id: "T2", quote: insuranceWaits.quote }]);
  });

  it("asks again for a statement whose quote is not in the plan, and drops it on the last attempt", () => {
    const invented = { ...insuranceWaits, quote: "Insurance comes after approval." };
    expect(reconcileDependencies(plan, tasks, [invented], { lastAttempt: false }).errors[0]).toContain(
      'dependency_statements[0] quote is not in the plan: "Insurance comes after approval."',
    );
    const last = reconcileDependencies(plan, tasks, [invented], { lastAttempt: true });
    expect(last.errors).toEqual([]);
    expect(last.tasks).toEqual(tasks);
  });

  it("ignores statements it cannot place, and dependencies already present", () => {
    const unknown = { ...insuranceWaits, task: "something else entirely" };
    const present = {
      quote: "They also need to see our insurance certificate before they will sign off the course.",
      task: "Get the course approved by the council",
      waits_for: "Take out the event insurance",
    };
    const result = reconcileDependencies(plan, tasks, [unknown, present], { lastAttempt: false });
    expect(result.errors).toEqual([]);
    expect(result.tasks).toEqual(tasks);
  });

  it("never makes a task wait for itself", () => {
    const self = { ...insuranceWaits, waits_for: "take out the event insurance" };
    expect(reconcileDependencies(plan, tasks, [self], { lastAttempt: true }).tasks).toEqual(tasks);
  });
});
