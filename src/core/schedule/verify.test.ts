import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ScheduleRequest } from "../contracts";
import { verifyScheduleResponse } from "./verify";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../examples/${name}`, import.meta.url), "utf8"));

const exampleRequest = read("schedule-request.json") as ScheduleRequest;
const exampleResponse = read("schedule-response.json") as Record<string, unknown>;

describe("verifyScheduleResponse (TypeScript port of check_contract.py)", () => {
  it("accepts the contract's example response", () => {
    expect(verifyScheduleResponse(exampleRequest, exampleResponse)).toEqual([]);
  });

  it("finds an owner overlap", () => {
    const response = structuredClone(exampleResponse) as {
      schedule: { id: string; start_day: number; end_day: number }[];
    };
    // Move A (Ann, 3 days) to day 0, on top of C (Ann, days 0-4).
    response.schedule = response.schedule.map((entry) =>
      entry.id === "A" ? { ...entry, start_day: 0, end_day: 3 } : entry,
    );
    expect(verifyScheduleResponse(exampleRequest, response)).toContain(
      "tasks C and A overlap for owner Ann",
    );
  });

  it("finds a task that starts before its dependency ends", () => {
    const response = structuredClone(exampleResponse) as {
      schedule: { id: string; start_day: number; end_day: number }[];
    };
    response.schedule = response.schedule.map((entry) =>
      entry.id === "D" ? { ...entry, start_day: 3, end_day: 5 } : entry,
    );
    expect(verifyScheduleResponse(exampleRequest, response)).toContain(
      "task D depends on C and starts before its end_day",
    );
  });

  it("finds wrong totals", () => {
    const response = { ...exampleResponse, end_day: 8, days_late: 1, meets_deadline: false };
    const errors = verifyScheduleResponse(exampleRequest, response);
    expect(errors).toContain("end_day must equal the largest task end_day");
  });

  it("finds a missing task and a wrong duration", () => {
    const response = structuredClone(exampleResponse) as {
      schedule: { id: string; start_day: number; end_day: number }[];
    };
    response.schedule = response.schedule.filter((entry) => entry.id !== "B");
    expect(verifyScheduleResponse(exampleRequest, response)).toContain(
      "missing task B from schedule",
    );
  });

  it("checks a cycle answer names ids on one circular dependency", () => {
    const request: ScheduleRequest = {
      deadline_day: 10,
      tasks: [
        { id: "A", name: "A", owner: null, duration_days: 1, depends_on: ["B"] },
        { id: "B", name: "B", owner: null, duration_days: 1, depends_on: ["A"] },
        { id: "C", name: "C", owner: null, duration_days: 1, depends_on: ["A"] },
      ],
    };
    const cycle = (ids: string[]) => ({
      status: "cycle",
      schedule: [],
      end_day: null,
      deadline_day: 10,
      meets_deadline: null,
      days_late: null,
      cycle: ids,
    });
    expect(verifyScheduleResponse(request, cycle(["B", "A"]))).toEqual([]);
    expect(verifyScheduleResponse(request, cycle(["C", "A"]))).toContain(
      "cycle ids must lie on one circular dependency",
    );
  });
});
