import { describe, expect, it } from "vitest";
import type { Task } from "../core/contracts";
import { scheduleTasks } from "../core/schedule/schedule";
import {
  compareOutcomes,
  describeChange,
  diffCorrections,
  loadCorrections,
  nextTaskId,
  saveCorrections,
} from "./corrections";

const t = (
  id: string,
  name: string,
  days: number,
  owner: string | null = "Ruth",
  depends_on: string[] = [],
): Task => ({
  id,
  name,
  owner,
  duration_days: days,
  depends_on,
});

const original = {
  deadline_day: 45,
  tasks: [t("T1", "Road closure", 14), t("T2", "Print posters", 4, "Tom", ["T1"])],
};

describe("diffCorrections and describeChange", () => {
  it("finds nothing when nothing changed", () => {
    expect(diffCorrections(original, structuredClone(original))).toEqual([]);
  });

  it("describes each kind of change in plain words", () => {
    const edited = structuredClone(original);
    edited.deadline_day = 50;
    edited.tasks[0]!.duration_days = 10;
    edited.tasks[1]!.owner = "Hannah";
    edited.tasks[1]!.depends_on = [];
    edited.tasks.push(t("T3", "Hire a PA", 3, null));
    const changes = diffCorrections(original, edited);
    expect(changes.map((change) => describeChange(change))).toEqual([
      "Deadline: day 45 → day 50",
      "Road closure: 14 → 10 days",
      "Print posters: owner Tom → Hannah",
      'Print posters: no longer waits for "Road closure"',
      'Added "Hire a PA"',
    ]);
  });

  it("describes a removed task and a new dependency", () => {
    const edited = { deadline_day: 45, tasks: [t("T2", "Print posters", 4, "Tom", [])] };
    edited.tasks.push(t("T9", "Check proofs", 1, "Tom"));
    edited.tasks[0]!.depends_on = ["T9"];
    expect(diffCorrections(original, edited).map((c) => describeChange(c))).toEqual([
      'Removed "Road closure"',
      'Print posters: now waits for "Check proofs"',
      'Print posters: no longer waits for "Road closure"',
      'Added "Check proofs"',
    ]);
  });
});

describe("compareOutcomes", () => {
  const run = (tasks: Task[], deadline: number) => scheduleTasks({ tasks, deadline_day: deadline });

  it("says how much sooner and whether it is still late", () => {
    const before = run([t("A", "A", 10), t("B", "B", 10)], 15);
    const after = run([t("A", "A", 10), t("B", "B", 7)], 15);
    expect(compareOutcomes(before, after, 15)).toBe(
      "Finishes on day 17 instead of day 20, 3 days sooner. Still 2 days late.",
    );
  });

  it("celebrates nothing but states it plainly when the plan becomes on time", () => {
    const before = run([t("A", "A", 10), t("B", "B", 10)], 15);
    const after = run([t("A", "A", 5), t("B", "B", 5)], 15);
    expect(compareOutcomes(before, after, 15)).toBe(
      "Finishes on day 10 instead of day 20, 10 days sooner. Now on time, with 5 days to spare.",
    );
  });

  it("says when a change makes things later, or makes no difference", () => {
    const before = run([t("A", "A", 5)], 10);
    expect(compareOutcomes(before, run([t("A", "A", 12)], 10), 10)).toBe(
      "Finishes on day 12 instead of day 5, 7 days later. Now 2 days late.",
    );
    expect(compareOutcomes(before, run([t("A", "A", 5)], 10), 10)).toBe(
      "No change: it still finishes on day 5.",
    );
  });

  it("explains a change that creates or removes a circle", () => {
    const before = run([t("A", "A", 1), t("B", "B", 1, null, ["A"])], 5);
    const circle = run([t("A", "A", 1, null, ["B"]), t("B", "B", 1, null, ["A"])], 5);
    expect(compareOutcomes(before, circle, 5)).toBe(
      "Now it can't be scheduled: some tasks wait for each other.",
    );
    expect(compareOutcomes(circle, before, 5)).toBe(
      "It can be scheduled again. Finishes on day 2. On time, with 3 days to spare.",
    );
  });

  it("leaves lateness out when there is no deadline", () => {
    const before = run([t("A", "A", 5)], 0);
    const after = run([t("A", "A", 3)], 0);
    expect(compareOutcomes(before, after, null)).toBe(
      "Finishes on day 3 instead of day 5, 2 days sooner.",
    );
  });
});

describe("nextTaskId", () => {
  it("picks the next free T-number", () => {
    expect(nextTaskId([t("T1", "a", 1), t("T7", "b", 1), t("X", "c", 1)])).toBe("T8");
    expect(nextTaskId([])).toBe("T1");
  });
});

describe("saving corrections", () => {
  const storage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    };
  };

  it("restores corrections saved for the same review", () => {
    const store = storage();
    saveCorrections(
      store,
      "lantern",
      "2026-11-20T10:00:00Z",
      original,
      new Date("2026-11-20T14:05:00Z"),
    );
    expect(loadCorrections(store, "lantern", "2026-11-20T10:00:00Z")).toEqual({
      ...original,
      savedAt: "2026-11-20T14:05:00.000Z",
    });
  });

  it("drops corrections made to an older review", () => {
    const store = storage();
    saveCorrections(store, "lantern", "old", original, new Date());
    expect(loadCorrections(store, "lantern", "new")).toBeNull();
  });

  it("survives storage that throws or holds rubbish", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(loadCorrections(broken, "x", "y")).toBeNull();
    expect(() => saveCorrections(broken, "x", "y", original, new Date())).not.toThrow();
    const store = storage();
    store.setItem("plan-reviewer:corrections:x", "{oops");
    expect(loadCorrections(store, "x", "y")).toBeNull();
  });
});
