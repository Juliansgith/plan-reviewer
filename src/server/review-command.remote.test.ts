import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { reviewPlan } from "../core/review/review";
import type { StoredReview } from "../core/review/types";
import { runReviewCommand } from "./review-command";

// ./review with no model key of its own: it sends the plan to the deployed
// server (REVIEW_API_URL, REVIEW_API_TOKEN), checks what comes back against
// the plan, and only then writes it.

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

const TOKEN = "remote-token-for-tests";
const env = { REVIEW_API_URL: "https://reviews.example/", REVIEW_API_TOKEN: TOKEN };

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

describe("./review through the server", () => {
  it("sends only the plan, with the token, and writes the review it gets back", async () => {
    expect(await run(env, answerWith({ review }))).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(review);
    const [{ url, init }] = requests as [{ url: string; init: RequestInit }];
    expect(url).toBe("https://reviews.example/api/review");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(init.body))).toEqual({ plan });
    expect(messages.join("\n")).toContain("reviews.example");
    expect(messages.join("\n")).not.toContain(TOKEN);
  });

  it("checks the server's review against the plan, and writes nothing if it fails", async () => {
    const tampered = {
      ...review,
      tasks: review.tasks.map((t, i) => (i === 0 ? { ...t, quote: "Hire a brass band" } : t)),
    };
    expect(await run(env, answerWith({ review: tampered }))).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(messages.join("\n")).toContain('the quote "Hire a brass band" is not in the plan');

    expect(await run(env, answerWith({ review: { deadline_day: "soon" } }))).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it("never sends the token over plain HTTP, except to this computer", async () => {
    expect(await run({ ...env, REVIEW_API_URL: "http://reviews.example" })).toBe(2);
    expect(requests).toHaveLength(0);
    expect(messages.join("\n")).toContain("must start with https://");

    expect(
      await run({ ...env, REVIEW_API_URL: "http://127.0.0.1:3000" }, answerWith({ review })),
    ).toBe(0);
  });

  it("maps the server's answers to the usual exit codes", async () => {
    const refusal = (status: number, code: string, issues?: string[]) =>
      answerWith(
        { error: { code, message: `${code} message`, ...(issues && { issues }) } },
        status,
      );
    expect(await run(env, refusal(401, "unauthorized"))).toBe(2);
    expect(messages.join("\n")).toContain("REVIEW_API_TOKEN");
    expect(await run(env, refusal(422, "no_usable_review", ["Task T9 is unknown."]))).toBe(1);
    expect(messages.join("\n")).toContain("Task T9 is unknown.");
    expect(await run(env, refusal(413, "too_large"))).toBe(2);
    expect(await run(env, refusal(429, "hourly_limit"))).toBe(3);
    expect(await run(env, refusal(503, "model_unavailable"))).toBe(3);
    expect(await run(env, new TypeError("fetch failed"))).toBe(3);
    expect(existsSync(out)).toBe(false);
  });

  it("prefers a model key of its own when both are set", async () => {
    const own = new Response(
      JSON.stringify({
        model: "test-model",
        choices: [{ message: { content: answer }, finish_reason: "stop" }],
      }),
      { status: 200 },
    );
    expect(await run({ ...env, OPENROUTER_API_KEY: "sk-or-test" }, own)).toBe(0);
    expect(requests[0]!.url).toContain("openrouter.ai");
  });

  it("explains both ways to run it when neither is set", async () => {
    expect(await run({})).toBe(2);
    const text = messages.join("\n");
    expect(text).toContain("OPENROUTER_API_KEY");
    expect(text).toContain("REVIEW_API_URL and REVIEW_API_TOKEN");
  });
});
