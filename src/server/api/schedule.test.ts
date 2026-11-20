import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ScheduleRequest } from "../../core/contracts";
import { verifyScheduleResponse } from "../../core/schedule/verify";
import { handleSchedule, MAX_BODY_BYTES } from "./schedule";

const example = readFileSync(new URL("../../../examples/schedule-request.json", import.meta.url), "utf8");

function post(body: string, headers: Record<string, string> = { "content-type": "application/json" }) {
  return handleSchedule(new Request("http://localhost/api/schedule", { method: "POST", body, headers }));
}

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  owner: null,
  duration_days: 1,
  depends_on: [],
  ...extra,
});

async function expectRefusal(response: Response, status: number, fragment: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const body = (await response.json()) as { error: { code: string; message: string; issues?: string[] } };
  expect(body.error.code).toBeTruthy();
  expect([body.error.message, ...(body.error.issues ?? [])].join("\n")).toContain(fragment);
}

describe("POST /api/schedule", () => {
  it("answers the contract's example with a valid, optimal schedule", async () => {
    const response = await post(example);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(verifyScheduleResponse(JSON.parse(example) as ScheduleRequest, body)).toEqual([]);
    expect(body).toMatchObject({ status: "scheduled", end_day: 9, proof: { optimal: true } });
  });

  it("answers a circular dependency with 200 and the cycle", async () => {
    const response = await post(JSON.stringify({ tasks: [task("A", { depends_on: ["B"] }), task("B", { depends_on: ["A"] })], deadline_day: 10 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "cycle", end_day: null });
  });

  it("accepts a request without a content type, as long as it is JSON", async () => {
    expect((await post(example, {})).status).toBe(200);
  });

  it("refuses broken JSON with 400", async () => {
    await expectRefusal(await post("{not json"), 400, "not valid JSON");
  });

  it("refuses a body that is not JSON by its content type with 415", async () => {
    await expectRefusal(await post(example, { "content-type": "text/plain" }), 415, "application/json");
  });

  it("refuses an oversized body with 413", async () => {
    await expectRefusal(await post(" ".repeat(MAX_BODY_BYTES + 1)), 413, "too large");
  });

  it.each([
    ["duplicate ids", { tasks: [task("A"), task("A")], deadline_day: 3 }, 'duplicate task id "A"'],
    ["an unknown dependency", { tasks: [task("A", { depends_on: ["Z"] })], deadline_day: 3 }, 'unknown id "Z"'],
    ["a zero duration", { tasks: [task("A", { duration_days: 0 })], deadline_day: 3 }, "duration_days"],
    ["61 tasks", { tasks: Array.from({ length: 61 }, (_, i) => task(`T${i}`)), deadline_day: 3 }, "at most 60 tasks"],
    ["a missing deadline", { tasks: [task("A")] }, "deadline_day"],
    ["a list instead of an object", [], "request must be an object"],
  ])("refuses %s with 422 and says why", async (_label, body, fragment) => {
    await expectRefusal(await post(JSON.stringify(body)), 422, fragment);
  });
});
