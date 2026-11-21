import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { reviewPlan } from "../core/review/review";
import type { StoredReview } from "../core/review/types";
import { runReviewCommand } from "./review-command";
import { DEFAULT_REVIEW_SERVER } from "./remote-review";

// ./review needs no settings: it sends the plan to the deployed review
// server, which holds the model key (D20), checks what comes back against the
// plan, and only then writes it. REVIEW_LOCAL=1 with OPENROUTER_API_KEY calls
// the model directly instead.

const root = new URL("../../", import.meta.url);
const planPath = new URL("data/plans/spring-market.md", root).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
const plan = readFileSync(planPath, "utf8");
const answer = readFileSync(
  new URL("src/core/review/__fixtures__/spring-market.model.json", root),
  "utf8",
);

let review: StoredReview;
beforeAll(async () => {
  const outcome = await reviewPlan(
    plan,
    { complete: async () => ({ content: answer, model: "test-model", finishReason: "stop" }) },
    { model: "test-model" },
  );
  if (!outcome.ok) throw new Error(outcome.errors.join("; "));
  review = outcome.review;
});

let dir: string;
let out: string;
let messages: string[];
let requests: { url: string; init: RequestInit }[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "remote-"));
  out = join(dir, "spring-market.json");
  messages = [];
  requests = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(vars: Record<string, string | undefined>, ...responses: (Response | Error)[]) {
  return runReviewCommand([planPath, out], vars, {
    stderr: (line) => messages.push(line),
    fetch: (async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), init });
      const next = responses.shift() ?? new Response("{}", { status: 500 });
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch,
    sleep: async () => {},
  });
}
const answerWith = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("./review through the review server", () => {
  it("needs no settings: it sends only the plan to the deployed server", async () => {
    expect(await run({}, answerWith({ review }))).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(review);
    const [{ url, init }] = requests as [{ url: string; init: RequestInit }];
    expect(url).toBe(`${DEFAULT_REVIEW_SERVER}/api/review`);
    expect(DEFAULT_REVIEW_SERVER).toMatch(/^https:\/\//);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBeNull();
    expect(JSON.parse(String(init.body))).toEqual({ plan });
  });

  it("uses the server even when a model key is set, unless REVIEW_LOCAL=1", async () => {
    expect(await run({ OPENROUTER_API_KEY: "sk-or-test" }, answerWith({ review }))).toBe(0);
    expect(requests[0]!.url).toContain("/api/review");
    expect(new Headers(requests[0]!.init.headers).get("authorization")).toBeNull();
  });

  it("can point at another server", async () => {
    expect(await run({ REVIEW_API_URL: "https://reviews.example/" }, answerWith({ review }))).toBe(
      0,
    );
    expect(requests[0]!.url).toBe("https://reviews.example/api/review");
    expect(await run({ REVIEW_API_URL: "http://127.0.0.1:3000" }, answerWith({ review }))).toBe(0);
    expect(await run({ REVIEW_API_URL: "http://reviews.example" })).toBe(2);
    expect(messages.join("\n")).toContain("must start with https://");
  });

  it("checks the server's review against the plan, and writes nothing if it fails", async () => {
    const tampered = {
      ...review,
      tasks: review.tasks.map((t, i) => (i === 0 ? { ...t, quote: "Hire a brass band" } : t)),
    };
    expect(await run({}, answerWith({ review: tampered }))).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(messages.join("\n")).toContain('the quote "Hire a brass band" is not in the plan');

    expect(await run({}, answerWith({ review: { deadline_day: "soon" } }))).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it("maps the server's answers to the usual exit codes", async () => {
    const refusal = (status: number, code: string, issues?: string[]) =>
      answerWith(
        { error: { code, message: `${code} message`, ...(issues && { issues }) } },
        status,
      );
    expect(await run({}, refusal(422, "no_usable_review", ["Task T9 is unknown."]))).toBe(1);
    expect(messages.join("\n")).toContain("Task T9 is unknown.");
    expect(await run({}, refusal(413, "too_large"))).toBe(2);
    expect(await run({}, refusal(429, "hourly_limit"))).toBe(3);
    expect(await run({}, refusal(503, "model_unavailable"))).toBe(3);
    expect(await run({}, new TypeError("fetch failed"))).toBe(3);
    expect(existsSync(out)).toBe(false);
  });

  it("calls the model directly with REVIEW_LOCAL=1 and a key, and says so without a key", async () => {
    const own = new Response(
      JSON.stringify({
        model: "test-model",
        choices: [{ message: { content: answer }, finish_reason: "stop" }],
      }),
      { status: 200 },
    );
    expect(await run({ REVIEW_LOCAL: "1", OPENROUTER_API_KEY: "sk-or-test" }, own)).toBe(0);
    expect(requests[0]!.url).toContain("openrouter.ai");

    expect(await run({ REVIEW_LOCAL: "1" })).toBe(2);
    expect(messages.join("\n")).toContain("OPENROUTER_API_KEY");
  });
});
