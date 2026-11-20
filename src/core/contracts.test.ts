import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_TASKS,
  parseReview,
  parseScheduleRequest,
  type ScheduleRequest,
} from "./contracts";

const example = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../examples/${name}`, import.meta.url), "utf8"));

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Task ${id}`,
  owner: null,
  duration_days: 1,
  depends_on: [],
  ...extra,
});

const request = (tasks: unknown[], deadline_day: unknown = 10) => ({ tasks, deadline_day });

function expectErrors(result: ReturnType<typeof parseScheduleRequest>, ...fragments: string[]) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  const text = result.errors.join("\n");
  for (const fragment of fragments) expect(text).toContain(fragment);
}

describe("parseScheduleRequest", () => {
  it("accepts the contract's example request", () => {
    const result = parseScheduleRequest(example("schedule-request.json"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tasks.map((t) => t.id)).toEqual(["A", "B", "C", "D"]);
  });

  it("accepts an empty task list", () => {
    expect(parseScheduleRequest(request([])).ok).toBe(true);
  });

  it(`accepts exactly ${MAX_TASKS} tasks and refuses ${MAX_TASKS + 1}`, () => {
    const tasks = Array.from({ length: MAX_TASKS + 1 }, (_, i) => task(`T${i}`));
    expect(parseScheduleRequest(request(tasks.slice(0, MAX_TASKS))).ok).toBe(true);
    expectErrors(parseScheduleRequest(request(tasks)), `at most ${MAX_TASKS} tasks`);
  });

  it("refuses duplicate ids and names the id", () => {
    expectErrors(parseScheduleRequest(request([task("A"), task("A")])), 'duplicate task id "A"');
  });

  it("refuses a dependency on an unknown id and names both ids", () => {
    expectErrors(
      parseScheduleRequest(request([task("A", { depends_on: ["Z"] })])),
      'task "A" depends on unknown id "Z"',
    );
  });

  it.each([0, -3, 1.5, "3", null])("refuses duration_days %j", (duration) => {
    expectErrors(
      parseScheduleRequest(request([task("A", { duration_days: duration })])),
      "tasks[0].duration_days",
    );
  });

  it("allows a self-dependency, because a cycle is a valid request with a cycle answer", () => {
    expect(parseScheduleRequest(request([task("A", { depends_on: ["A"] })])).ok).toBe(true);
  });

  it("requires owner to be present, as a string or null", () => {
    const { owner: _owner, ...withoutOwner } = task("A");
    expectErrors(parseScheduleRequest(request([withoutOwner])), "tasks[0].owner");
    expectErrors(parseScheduleRequest(request([task("A", { owner: 7 })])), "tasks[0].owner");
    expect(parseScheduleRequest(request([task("A", { owner: "Ann" })])).ok).toBe(true);
  });

  it.each([null, 1.5, "10", undefined])("refuses deadline_day %j", (deadline) => {
    expectErrors(parseScheduleRequest(request([task("A")], deadline)), "deadline_day");
  });

  it("refuses a body that is not an object, or has no task list", () => {
    expectErrors(parseScheduleRequest([]), "request must be an object");
    expectErrors(parseScheduleRequest({ deadline_day: 3 }), "tasks");
  });

  it("ignores extra fields, as the contract allows", () => {
    const result = parseScheduleRequest({
      ...request([task("A", { colour: "red" })]),
      note: "extra",
    });
    expect(result.ok).toBe(true);
  });

  it("returns typed tasks", () => {
    const result = parseScheduleRequest(example("schedule-request.json"));
    if (!result.ok) throw new Error(result.errors.join("; "));
    const typed: ScheduleRequest = result.value;
    expect(typed.deadline_day).toBe(10);
    expect(typed.tasks[1]?.depends_on).toEqual(["A"]);
  });
});

describe("parseReview", () => {
  const reviewTask = (id: string, extra: Record<string, unknown> = {}) => ({
    ...task(id),
    quote: `Quote for ${id}`,
    ...extra,
  });
  const finding = (extra: Record<string, unknown> = {}) => ({
    title: "A title",
    detail: "A detail",
    quote: null,
    ...extra,
  });
  const review = (extra: Record<string, unknown> = {}) => ({
    deadline_day: 10,
    tasks: [reviewTask("T1")],
    findings: [finding()],
    ...extra,
  });

  it("accepts the contract's example review", () => {
    expect(parseReview(example("review-output.json")).ok).toBe(true);
  });

  it("accepts a null deadline and a null finding quote", () => {
    expect(parseReview(review({ deadline_day: null })).ok).toBe(true);
    expect(parseReview(review({ findings: [finding({ quote: null })] })).ok).toBe(true);
  });

  it("requires a string quote on every task", () => {
    const result = parseReview(review({ tasks: [reviewTask("T1", { quote: null })] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("tasks[0].quote");
  });

  it("refuses duplicate ids and unknown dependencies", () => {
    const result = parseReview(
      review({ tasks: [reviewTask("T1"), reviewTask("T1", { depends_on: ["T9"] })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.errors.join("\n");
      expect(text).toContain('duplicate task id "T1"');
      expect(text).toContain('depends on unknown id "T9"');
    }
  });

  it("keeps extra fields so our own additions survive a round trip", () => {
    const result = parseReview(
      review({ findings: [finding({ severity: "blocker" })], deadline_quote: "by day 10" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.findings[0]).toMatchObject({ severity: "blocker" });
      expect(result.value).toMatchObject({ deadline_quote: "by day 10" });
    }
  });

  it("does not limit the review to 60 tasks; that limit belongs to the schedule request", () => {
    const tasks = Array.from({ length: 61 }, (_, i) => reviewTask(`T${i}`));
    expect(parseReview(review({ tasks })).ok).toBe(true);
  });
});
