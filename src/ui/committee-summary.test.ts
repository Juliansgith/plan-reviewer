import { describe, expect, it } from "vitest";
import type { ReviewFinding } from "../core/review/types";
import { committeeSummary } from "./committee-summary";

const finding = (
  severity: ReviewFinding["severity"],
  title: string,
  quote: string | null,
): ReviewFinding => ({
  title,
  detail: `${title} detail.`,
  quote,
  severity,
  source: "model",
  kind: "model",
});

describe("committeeSummary", () => {
  const text = committeeSummary({
    title: "Pellerby Lantern Festival",
    verdict: {
      headline: "7 days late",
      sentence: "The earliest the work can finish is day 52. The deadline is day 45.",
      reason: "Ruth has 52 days of work.",
    },
    findings: [
      finding("blocker", "Cannot finish by day 45", "The festival is on the evening of day 45"),
      finding("note", "Small thing", null),
      finding("warning", "No owner for bins", "Arrange extra bins"),
    ],
  });

  it("opens with the plan and the verdict", () => {
    expect(text.split("\n").slice(0, 3)).toEqual([
      "Pellerby Lantern Festival",
      "",
      "7 days late. The earliest the work can finish is day 52. The deadline is day 45. Ruth has 52 days of work.",
    ]);
  });

  it("lists blockers and warnings with the committee's own words, and leaves notes out", () => {
    expect(text).toContain(
      '1. Cannot finish by day 45. Cannot finish by day 45 detail.\n   Your plan says: "The festival is on the evening of day 45"',
    );
    expect(text).toContain(
      '2. No owner for bins. No owner for bins detail.\n   Your plan says: "Arrange extra bins"',
    );
    expect(text).not.toContain("Small thing");
  });
});
