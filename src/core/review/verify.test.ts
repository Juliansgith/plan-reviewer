import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Review } from "../contracts";
import { checkReviewAgainstPlan } from "./verify";

const plan = readFileSync(new URL("../../../data/plans/spring-market.md", import.meta.url), "utf8");

const review = (overrides: Partial<Review> = {}): Review =>
  ({
    deadline_day: 21,
    deadline_quote: null,
    tasks: [
      {
        id: "T1",
        name: "Book the main hall and the side room",
        owner: "Joan",
        duration_days: 2,
        depends_on: [],
        quote: "Book the main hall and the side room",
      },
    ],
    findings: [],
    ...overrides,
  }) as Review;

describe("checkReviewAgainstPlan", () => {
  it("accepts a review whose quotes are in the plan and whose deadline the plan states", () => {
    expect(checkReviewAgainstPlan(plan, review())).toEqual([]);
  });

  it("lists every quote that is not in the plan", () => {
    const problems = checkReviewAgainstPlan(
      plan,
      review({
        tasks: [{ ...review().tasks[0]!, quote: "Hire a brass band" }],
        findings: [
          {
            title: "x",
            detail: "y",
            quote: "Nobody wrote this",
            severity: "warning",
          } as Review["findings"][number],
        ],
      }),
    );
    expect(problems).toEqual([
      'Task T1: the quote "Hire a brass band" is not in the plan.',
      'Finding 1: the quote "Nobody wrote this" is not in the plan.',
    ]);
  });

  it("refuses a deadline the plan never states", () => {
    expect(checkReviewAgainstPlan(plan, review({ deadline_day: 99 }))).toEqual([
      "The review's deadline, day 99, is not a deadline the plan states (the plan states day 21).",
    ]);
  });
});
