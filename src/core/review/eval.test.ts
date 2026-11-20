import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPECTATIONS, scoreReview } from "./eval";
import { reviewPlan } from "./review";
import type { ChatClient, StoredReview } from "./types";

const plan = (name: string) =>
  readFileSync(new URL(`../../../data/plans/${name}.md`, import.meta.url), "utf8");
const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}.model.json`, import.meta.url), "utf8");
const once = (content: string): ChatClient => ({
  complete: async (request) => ({ content, model: request.model, finishReason: "stop" }),
});

async function reviewed(name: string, content = fixture(name)): Promise<StoredReview> {
  const outcome = await reviewPlan(plan(name), once(content), { model: "test" });
  if (!outcome.ok) throw new Error(outcome.errors.join("; "));
  return outcome.review;
}

describe("evaluation expectations", () => {
  it("covers the three sample plans", () => {
    expect(Object.keys(EXPECTATIONS).sort()).toEqual([
      "harbour-run",
      "lantern-festival",
      "spring-market",
    ]);
  });

  it("passes a correct Spring Market review on every check", async () => {
    const checks = scoreReview("spring-market", await reviewed("spring-market"));
    expect(checks.filter((check) => !check.pass)).toEqual([]);
  });

  it("passes a correct Harbour Run review on every check", async () => {
    const checks = scoreReview("harbour-run", await reviewed("harbour-run"));
    expect(checks.filter((check) => !check.pass)).toEqual([]);
  });

  it("fails a Harbour Run review that misses the cycle", async () => {
    const answer = JSON.parse(fixture("harbour-run"));
    answer.tasks[2].depends_on = [];
    const checks = scoreReview(
      "harbour-run",
      await reviewed("harbour-run", JSON.stringify(answer)),
    );
    expect(checks.find((check) => check.name.includes("cycle"))?.pass).toBe(false);
  });

  it("fails a Spring Market review with a wrong duration, and says which", async () => {
    const answer = JSON.parse(fixture("spring-market"));
    answer.tasks[4].duration_days = 5;
    const checks = scoreReview(
      "spring-market",
      await reviewed("spring-market", JSON.stringify(answer)),
    );
    const failed = checks.filter((check) => !check.pass);
    expect(failed.map((check) => check.name)).toContain("Print the posters: 7 days");
  });
});
