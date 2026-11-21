import { describe, expect, it } from "vitest";
import type { Task } from "@/core/contracts";
import type { ReviewFinding } from "@/core/review/types";
import { scheduleTasks } from "@/core/schedule/schedule";
import type { Draft } from "./corrections";
import { fieldId, fixesFor, type FixContext } from "./fixes";

const task = (
  id: string,
  name: string,
  owner: string | null,
  duration_days: number,
  depends_on: string[] = [],
): Task => ({ id, name, owner, duration_days, depends_on });

const finding = (kind: ReviewFinding["kind"], overrides: Partial<ReviewFinding> = {}) =>
  ({
    title: "A remark",
    detail: "Detail.",
    quote: null,
    severity: "blocker",
    source: kind === "model" ? "model" : "code",
    kind,
    ...overrides,
  }) as ReviewFinding;

function context(original: Draft, current: Draft = original, candidates: number[] = []) {
  const schedule = (draft: Draft) =>
    scheduleTasks({ tasks: draft.tasks, deadline_day: draft.deadline_day ?? 0 });
  return {
    original,
    current,
    originalSchedule: schedule(original),
    currentSchedule: schedule(current),
    deadlineCandidates: candidates,
  } satisfies FixContext;
}

const CIRCLE: Draft = {
  deadline_day: 20,
  tasks: [
    task("T1", "Approve the course", "Ann", 5, ["T2"]),
    task("T2", "Insure the run", "Bob", 3, ["T1"]),
    task("T3", "Find marshals", "Cat", 4),
  ],
};

describe("fixesFor: tasks in a circle", () => {
  const remarks = [finding("cycle", { title: "Tasks wait on each other in a circle" })];

  it("offers one button per task in the circle, each making that task go first", () => {
    const [help] = fixesFor(remarks, context(CIRCLE));
    expect(help!.advice).toBe(
      "Ask the committee which of these comes first. If you already know, choose it here to see the dates.",
    );
    expect(help!.actions.map((a) => a.label)).toEqual([
      'Do "Approve the course" first',
      'Do "Insure the run" first',
    ]);
    const first = help!.actions[0]!;
    expect(first.kind).toBe("apply");
    if (first.kind !== "apply") return;
    expect(first.draft.tasks.find((t) => t.id === "T1")!.depends_on).toEqual([]);
    expect(first.draft.tasks.find((t) => t.id === "T2")!.depends_on).toEqual(["T1"]);
    expect(help!.sorted).toBeNull();
  });

  it("says it is sorted once the changes break the circle", () => {
    const [help] = fixesFor(remarks, context(CIRCLE));
    const first = help!.actions[0]!;
    if (first.kind !== "apply") throw new Error("expected an apply action");
    const [after] = fixesFor(remarks, context(CIRCLE, first.draft));
    expect(after!.sorted).toBe("These tasks no longer wait for each other.");
  });

  it("does not claim anything while the new dates are still being worked out", () => {
    const changed = { ...CIRCLE, tasks: CIRCLE.tasks.map((t) => ({ ...t, depends_on: [] })) };
    const [help] = fixesFor(remarks, { ...context(CIRCLE, changed), currentSchedule: null });
    expect(help!.sorted).toBeNull();
  });
});

describe("fixesFor: late", () => {
  const LATE: Draft = {
    deadline_day: 6,
    tasks: [
      task("T1", "Book the hall", "Ann", 3),
      task("T2", "Print posters", "Ann", 4),
      task("T3", "Find stewards", "Bob", 2),
    ],
  };
  const remarks = [finding("late", { title: "Cannot finish by day 6" })];

  it("names the overloaded person and points to the timeline", () => {
    const [help] = fixesFor(remarks, context(LATE));
    expect(help!.advice).toBe(
      "Ann has too much to do alone. Drag one of Ann's tasks to someone else in the timeline, or ask the committee for a later date.",
    );
    expect(help!.actions).toEqual([{ kind: "timeline", label: "Go to the timeline" }]);
    expect(help!.sorted).toBeNull();
  });

  it("is sorted when the changes make it finish in time", () => {
    const moved = {
      ...LATE,
      tasks: LATE.tasks.map((t) => (t.id === "T2" ? { ...t, owner: "Bob" } : t)),
    };
    const [help] = fixesFor(remarks, context(LATE, moved));
    expect(help!.sorted).toBe("It now finishes on day 6, in time for day 6.");
  });

  it("explains a chain of tasks that is simply too long", () => {
    const chain: Draft = {
      deadline_day: 5,
      tasks: [task("T1", "Book", "Ann", 3), task("T2", "Print", "Bob", 4, ["T1"])],
    };
    const [help] = fixesFor(remarks, context(chain));
    expect(help!.advice).toBe(
      "The green tasks in the timeline happen one after another and take too long. Drag the end of one to shorten it, or ask the committee for a later date.",
    );
  });
});

describe("fixesFor: deadlines", () => {
  const OPEN: Draft = { deadline_day: null, tasks: [task("T1", "Book", "Ann", 3)] };

  it("offers each date the plan gives when it gives more than one", () => {
    const [help] = fixesFor([finding("deadline_conflict")], context(OPEN, OPEN, [30, 35]));
    expect(help!.advice).toBe(
      "Ask the committee which date is right. To see the dates against one, choose it here.",
    );
    expect(help!.actions.map((a) => a.label)).toEqual(["Use day 30", "Use day 35"]);
    const use35 = help!.actions[1]!;
    if (use35.kind !== "apply") throw new Error("expected an apply action");
    expect(use35.draft.deadline_day).toBe(35);
  });

  it("is sorted once Nora chooses a deadline", () => {
    const chosen = { ...OPEN, deadline_day: 30 };
    for (const kind of ["deadline_conflict", "no_deadline"] as const) {
      const [help] = fixesFor([finding(kind)], context(OPEN, chosen, [30, 35]));
      expect(help!.sorted).toBe("You chose day 30 as the deadline.");
    }
  });

  it("takes Nora to the deadline field when the plan gives no date", () => {
    const [help] = fixesFor([finding("no_deadline", { severity: "warning" })], context(OPEN));
    expect(help!.actions).toEqual([
      { kind: "edit", label: "Set a deadline", focus: fieldId.deadline },
    ]);
  });
});

describe("fixesFor: owners", () => {
  const NOBODY: Draft = {
    deadline_day: 10,
    tasks: [task("T1", "Book", "Ann", 3), task("T2", "Find marshals", null, 4)],
  };
  const remarks = [
    finding("no_owner", { title: 'No owner for "Find marshals"', severity: "warning" }),
  ];

  it("takes Nora to that task's owner field", () => {
    const [help] = fixesFor(remarks, context(NOBODY));
    expect(help!.advice).toBe(
      "Ask the committee who will do it. To see the effect, choose someone here, or drag it to a person in the timeline.",
    );
    expect(help!.actions).toEqual([
      { kind: "edit", label: "Choose who does it", focus: fieldId.owner("T2") },
    ]);
  });

  it("is sorted once the task has an owner, or is removed", () => {
    const given = {
      ...NOBODY,
      tasks: NOBODY.tasks.map((t) => (t.id === "T2" ? { ...t, owner: "Ann" } : t)),
    };
    expect(fixesFor(remarks, context(NOBODY, given))[0]!.sorted).toBe("Ann does it now.");
    const removed = { ...NOBODY, tasks: NOBODY.tasks.filter((t) => t.id !== "T2") };
    expect(fixesFor(remarks, context(NOBODY, removed))[0]!.sorted).toBe("You removed this task.");
  });

  it("is sorted when two names for one person become one", () => {
    const two: Draft = {
      deadline_day: 10,
      tasks: [task("T1", "Book", "Sam", 3), task("T2", "Print", "Sam Lee", 4)],
    };
    const remark = finding("owner_names", {
      severity: "warning",
      detail: '"Sam" and "Sam Lee" are both listed as owners. If they are the same person, ...',
    });
    expect(fixesFor([remark], context(two))[0]!.sorted).toBeNull();
    const one = { ...two, tasks: two.tasks.map((t) => ({ ...t, owner: "Sam Lee" })) };
    expect(fixesFor([remark], context(two, one))[0]!.sorted).toBe("Their tasks now use one name.");
  });
});

describe("fixesFor: remarks only the committee can fix", () => {
  const PLAIN: Draft = { deadline_day: 10, tasks: [task("T1", "Book", "Ann", 3)] };

  it("says the remark is in the reply, and offers no buttons", () => {
    const [model, instructions, note] = fixesFor(
      [
        finding("model", { severity: "warning" }),
        finding("instructions", { severity: "warning" }),
        finding("model", { severity: "note" }),
      ],
      context(PLAIN),
    );
    expect(model).toEqual({
      advice: "Ask the committee about this. It is in your reply.",
      actions: [],
      sorted: null,
    });
    expect(instructions!.advice).toBe(
      "Nothing to change here. Ask the committee why it is in the plan. It is in your reply.",
    );
    expect(note).toEqual({ advice: null, actions: [], sorted: null });
  });
});
