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

// Written for someone who is not technical: plain words, no jargon.
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
      headline: "Will finish 3 days late",
      sentence: "The earliest it can all be done is day 10. The deadline is day 7.",
      reason: "Ruth has 10 days of work and can only do one task at a time.",
      reasonLabel: "Why",
      proof: "We tried every possible order of the tasks. None finishes sooner.",
    });
  });

  it("says an on-time plan is on time and how much room is left", () => {
    const result = verdict([t("A", "Book hall", 2), t("B", "Posters", 3, null, ["A"])], 8);
    expect(result).toMatchObject({
      tone: "good",
      label: "On time",
      headline: "On time, with 3 days to spare",
      sentence: "The earliest it can all be done is day 5. The deadline is day 8.",
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

  it("names the two tasks that wait for each other", () => {
    const tasks = [
      t("A", "Approve course", 7, "Dan", ["B"]),
      t("B", "Insurance", 3, "Kerry", ["A"]),
    ];
    expect(verdict(tasks, 30)).toMatchObject({
      tone: "bad",
      label: "Can't be scheduled",
      headline: "Can't be scheduled",
      sentence:
        '"Approve course" waits for "Insurance", and "Insurance" waits for "Approve course", so neither can start.',
      reason: "Ask the committee which of these should happen first.",
      reasonLabel: "What to do",
    });
  });

  it("names every task in a longer circle", () => {
    const tasks = [
      t("A", "One", 1, null, ["B"]),
      t("B", "Two", 1, null, ["C"]),
      t("C", "Three", 1, null, ["A"]),
    ];
    expect(verdict(tasks, 30).sentence).toBe(
      '"One" waits for "Two", which waits for "Three", which waits for "One", so none of them can start.',
    );
  });

  it("compares against each stated deadline when the plan gives several", () => {
    const tasks = [t("A", "Hall", 33)];
    expect(verdict(tasks, null, [30, 35])).toMatchObject({
      tone: "neutral",
      label: "No clear deadline",
      headline: "No clear deadline",
      sentence: "The plan gives two deadlines: day 30 and day 35.",
      reason:
        "The earliest it can all be done is day 33: 3 days late for day 30, and on time for day 35.",
    });
  });

  it("labels the comparison against several deadlines as neither a cause nor an action", () => {
    expect(verdict([t("A", "Hall", 33)], null, [30, 35]).reasonLabel).toBeNull();
  });

  it("still gives the earliest finish when the plan gives no deadline at all", () => {
    expect(verdict([t("A", "Hall", 3)], null)).toMatchObject({
      sentence: "The plan does not say by which day everything must be done.",
      reason: "The earliest it can all be done is day 3.",
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
      sentence: "The best order found finishes on day 6. The deadline is day 2.",
      proof: "This is the best order found in the time available. Nothing can finish before day 4.",
    });
  });
});
