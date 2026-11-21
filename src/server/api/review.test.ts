import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { parseReview } from "../../core/contracts";
import {
  ModelServiceError,
  type ChatClient,
  type ChatRequest,
  type ChatResponse,
} from "../../core/review/types";
import { createReviewHandler, MAX_PLAN_BYTES, type AuditEntry } from "./review";

const root = new URL("../../../", import.meta.url);
const plan = readFileSync(new URL("data/plans/spring-market.md", root), "utf8");
const answer = readFileSync(
  new URL("src/core/review/__fixtures__/spring-market.model.json", root),
  "utf8",
);

const reply = (content: string): ChatResponse => ({
  content,
  model: "test-model",
  finishReason: "stop",
  usage: { promptTokens: 100, completionTokens: 50, cost: 0.0002 },
});

let calls: ChatRequest[];
let logs: AuditEntry[];
let clock: number;
beforeEach(() => {
  calls = [];
  logs = [];
  clock = Date.UTC(2026, 10, 21, 12);
});

function scripted(...answers: (string | Error)[]): ChatClient {
  return {
    complete: async (request) => {
      calls.push(request);
      const next = answers.shift() ?? answer;
      if (next instanceof Error) throw next;
      return reply(next);
    },
  };
}

function handler(client: ChatClient | null = scripted(), overrides = {}) {
  return createReviewHandler({
    client,
    model: "test-model",
    now: () => clock,
    log: (entry) => logs.push(entry),
    ...overrides,
  });
}

const post = (handle: (request: Request) => Promise<Response>, body: unknown) =>
  handle(
    new Request("http://localhost/api/review", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/review", () => {
  it("needs no token or key from the caller: the server's key does the work", async () => {
    const response = await post(handler(), { plan });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("is off when the server has no model key", async () => {
    const response = await post(handler(null), { plan });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("not_enabled");
  });

  it("accepts only a plan: no other fields, no empty or oversized plans, valid JSON", async () => {
    const handle = handler();
    expect((await post(handle, "{not json")).status).toBe(400);
    expect((await post(handle, { plan: "  " })).status).toBe(422);
    expect((await post(handle, { plan, model: "openai/gpt-6" })).status).toBe(422);
    expect((await post(handle, { plan, messages: [] })).status).toBe(422);
    expect((await post(handle, { plan: "x".repeat(MAX_PLAN_BYTES + 1) })).status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("reviews the plan with the server's own model, prompt and limits", async () => {
    const response = await post(handler(), { plan });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const { review } = await response.json();
    expect(parseReview(review).ok).toBe(true);
    expect(review.deadline_day).toBe(21);
    expect(calls[0]!.model).toBe("test-model");
    expect(calls[0]!.messages.at(-1)!.content).toContain("Spring Market");
  });

  it("says when no usable review could be made, with the problems", async () => {
    const response = await post(handler(scripted("nope", "nope", "nope")), { plan });
    expect(response.status).toBe(422);
    const { error } = await response.json();
    expect(error.code).toBe("no_usable_review");
    expect(error.issues.length).toBeGreaterThan(0);
  });

  it("reports model service failures without passing their details on", async () => {
    const cases = [
      [new ModelServiceError("OpenRouter refused the key sk-or-v1-abc (401)", "auth"), 503],
      [new ModelServiceError("Out of credit", "payment"), 503],
      [new ModelServiceError("Timed out", "timeout"), 504],
      [new ModelServiceError("Down", "unavailable"), 503],
      [new Error("boom at /srv/app"), 500],
    ] as const;
    for (const [error, status] of cases) {
      const response = await post(handler(scripted(error)), { plan });
      expect(response.status).toBe(status);
      expect(await response.text()).not.toMatch(/sk-or|boom|\/srv/);
    }
  });

  it("caps reviews per hour and per day, and says when to try again", async () => {
    const handle = handler(scripted(), { limits: { concurrent: 2, perHour: 2, perDay: 3 } });
    expect((await post(handle, { plan })).status).toBe(200);
    expect((await post(handle, { plan })).status).toBe(200);
    const capped = await post(handle, { plan });
    expect(capped.status).toBe(429);
    expect((await capped.json()).error.code).toBe("hourly_limit");
    expect(Number(capped.headers.get("retry-after"))).toBe(3600);

    clock += 3600_000;
    expect((await post(handle, { plan })).status).toBe(200);
    clock += 3600_000;
    const daily = await post(handle, { plan });
    expect(daily.status).toBe(429);
    expect((await daily.json()).error.code).toBe("daily_limit");
  });

  it("runs at most a few reviews at once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: ChatClient = {
      complete: async (request) => {
        calls.push(request);
        await gate;
        return reply(answer);
      },
    };
    const handle = handler(slow, { limits: { concurrent: 2, perHour: 10, perDay: 10 } });
    const first = post(handle, { plan });
    const second = post(handle, { plan });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const third = await post(handle, { plan });
    expect(third.status).toBe(429);
    expect((await third.json()).error.code).toBe("busy");
    release();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
  });

  it("writes one audit line per request, without the plan or the key", async () => {
    await post(handler(scripted(new ModelServiceError("bad key sk-or-v1-secret", "auth"))), {
      plan,
    });
    await post(handler(), "{not json");
    await post(handler(), { plan });
    expect(logs.map((l) => [l.outcome, l.status, l.reason ?? null])).toEqual([
      ["failed", 503, "model_unavailable"],
      ["refused", 400, "invalid_json"],
      ["ok", 200, null],
    ]);
    expect(logs[2]).toMatchObject({
      event: "review_request",
      client: "203.0.113.7",
      plan_bytes: Buffer.byteLength(plan),
      attempts: 1,
      prompt_tokens: 100,
      completion_tokens: 50,
    });
    expect(logs[2]!.plan_sha256).toMatch(/^[0-9a-f]{16}$/);
    const text = JSON.stringify(logs);
    expect(text).not.toContain("Spring Market");
    expect(text).not.toContain("sk-or");
  });
});
