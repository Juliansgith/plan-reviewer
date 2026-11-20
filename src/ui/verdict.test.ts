import { describe, expect, it } from "vitest";
import type { Task } from "../core/contracts";
import { scheduleTasks } from "../core/schedule/schedule";
import { describeVerdict } from "./verdict";

const t = (
  id: string,
  name: string,
  days: number,
  owner: string | null = null,
  depends_on: string[] = [],
): Task => ({
  id,
  name,
  owner,
  duration_days: days,
  depends_on,
});

function verdict(tasks: Task[], deadline: number | null, candidates: number[] = []) {
  const schedule = scheduleTasks({ tasks, deadline_day: deadline ?? 0 });
  return describeVerdict({
    schedule,
    deadline_day: deadline,
    deadline_candidates: candidates,
    tasks,
  });
}

describe("describeVerdict", () => {
  it("says a late plan is late, by how much, and why", () => {
    const tasks = [
      t("A", "Book bands", 5, "Ruth"),
      t("B", "Book food", 5, "Ruth"),
      t("C", "Posters", 2),
    ];
    expect(verdict(tasks, 7)).toEqual({
      tone: "bad",
      label: "3 days late",
      headline: "3 days late",
      sentence: "The earliest the work can finish is day 10. The deadline is day 7.",
      reason: "Ruth has 10 days of work and can only do one task at a time.",
      proof: "Checked: no order of the tasks finishes sooner.",
    });
  });

  it("says an on-time plan is on time and how much room is left", () => {
    const result = verdict([t("A", "Book hall", 2), t("B", "Posters", 3, null, ["A"])], 8);
    expect(result).toMatchObject({
      tone: "good",
      label: "On time",
      headline: "On time, 3 days to spare",
      sentence: "The earliest the work can finish is day 5. The deadline is day 8.",
      reason:
        'The longest chain of tasks that wait on each other takes 5 days: "Book hall", then "Posters".',
    });
  });

  it("uses singular days and says when there is no room at all", () => {
    expect(verdict([t("A", "Hall", 4)], 3)).toMatchObject({ label: "1 day late" });
    expect(verdict([t("A", "Hall", 4)], 4)).toMatchObject({
      headline: "On time, with no days to spare",
    });
  });

  it("names the tasks in a circle", () => {
    const tasks = [
      t("A", "Approve course", 7, "Dan", ["B"]),
      t("B", "Insurance", 3, "Kerry", ["A"]),
    ];
    expect(verdict(tasks, 30)).toMatchObject({
      tone: "bad",
      label: "Blocked",
      headline: "Cannot be scheduled",
      sentence: '"Approve course" waits for "Insurance", which waits for "Approve course".',
    });
  });

  it("compares against each stated deadline when the plan gives several", () => {
    const tasks = [t("A", "Hall", 33)];
    expect(verdict(tasks, null, [30, 35])).toMatchObject({
      tone: "neutral",
      label: "No clear deadline",
      headline: "Earliest finish: day 33",
      sentence: "The plan gives two deadlines: day 30 and day 35.",
      reason: "Against day 30 it is 3 days late. Against day 35 it is on time.",
    });
  });

  it("says so when the plan gives no deadline at all", () => {
    expect(verdict([t("A", "Hall", 3)], null)).toMatchObject({
      sentence: "The plan does not say by which day everything must be done.",
      reason: null,
    });
  });

  it("is honest when the solver could not prove its answer", () => {
    const schedule = scheduleTasks({ tasks: [t("A", "Hall", 4)], deadline_day: 2 });
    if (schedule.status !== "scheduled") throw new Error("expected a schedule");
    const unproven = {
      ...schedule,
      end_day: 6,
      days_late: 4,
      proof: { ...schedule.proof, optimal: false, lower_bound: 4 },
    };
    expect(
      describeVerdict({
        schedule: unproven,
        deadline_day: 2,
        deadline_candidates: [],
        tasks: [t("A", "Hall", 4)],
      }),
    ).toMatchObject({
      sentence: "The best schedule found finishes on day 6. The deadline is day 2.",
      proof: "Best found within the time limit. No order of the tasks can finish before day 4.",
    });
  });
});
