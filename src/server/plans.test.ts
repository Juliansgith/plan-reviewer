import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanRepository } from "./plans";

const PLAN = `# Pellerby Test Fair

Submitted by the Test Committee.

Everything must be done by day 10.

| Task | Who | How long | Can start after |
|---|---|---|---|
| Book the hall | Ann | 3 days | - |
| Print posters | Ann | 4 days | Book the hall |
| Find stewards | Bob | 2 days | - |
`;

const task = (
  id: string,
  name: string,
  owner: string,
  duration_days: number,
  depends_on: string[] = [],
) => ({
  id,
  name,
  owner,
  duration_days,
  depends_on,
  quote: name,
});

const goodReview = {
  deadline_day: 10,
  tasks: [
    task("T1", "Book the hall", "Ann", 3),
    task("T2", "Print posters", "Ann", 4, ["T1"]),
    task("T3", "Find stewards", "Bob", 2),
  ],
  findings: [
    {
      title: "Short on stewards",
      detail: "Two days may not be enough.",
      quote: "Find stewards",
      severity: "warning",
      source: "model",
      kind: "model",
    },
    { title: "No quote", detail: "General remark.", quote: null },
  ],
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plans-"));
  mkdirSync(join(dir, "plans"));
  mkdirSync(join(dir, "reviews"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function write(id: string, plan: string, review?: unknown) {
  writeFileSync(join(dir, "plans", `${id}.md`), plan);
  if (review !== undefined)
    writeFileSync(join(dir, "reviews", `${id}.json`), JSON.stringify(review));
}

describe("plan repository", () => {
  it("lists plans by title with a verdict for each", () => {
    write("fair", PLAN, goodReview);
    write("bare", "# A Plan Without Review\n\nNothing yet.\n");
    const plans = createPlanRepository(dir).list();
    expect(plans.map((p) => [p.id, p.title, p.verdict.status])).toEqual([
      ["bare", "A Plan Without Review", "not_reviewed"],
      ["fair", "Pellerby Test Fair", "on_time"],
    ]);
    expect(plans[1]!.verdict).toMatchObject({
      end_day: 7,
      deadline_day: 10,
      days_late: 0,
      tasks: 3,
      blockers: 0,
    });
  });

  it("loads a plan with its review, quote positions and schedule", () => {
    write("fair", PLAN, goodReview);
    const view = createPlanRepository(dir).get("fair");
    if (!view) throw new Error("expected a plan");
    expect(view.problems).toEqual([]);
    expect(view.review?.tasks).toHaveLength(3);
    const span = view.quotes.tasks.T1!;
    expect(view.text.slice(span.start, span.end)).toBe("Book the hall");
    expect(view.quotes.findings).toEqual([
      expect.objectContaining({ start: expect.any(Number) }),
      null,
    ]);
    expect(view.schedule).toMatchObject({ status: "scheduled", end_day: 7 });
  });

  it("fills in severity and source for findings from reviews written elsewhere", () => {
    write("fair", PLAN, goodReview);
    const view = createPlanRepository(dir).get("fair")!;
    expect(view.review!.findings[1]).toMatchObject({
      severity: "warning",
      source: "model",
      kind: "model",
    });
  });

  it.each(["../plans/fair", "..\\..\\README", "fair.md", "FAIR", "", "nope"])(
    "returns nothing for id %j",
    (id) => {
      write("fair", PLAN, goodReview);
      expect(createPlanRepository(dir).get(id)).toBeNull();
    },
  );

  it("refuses to show a review whose quotes are not in the plan", () => {
    const review = structuredClone(goodReview);
    review.tasks[1]!.quote = "Print some posters";
    write("fair", PLAN, review);
    const view = createPlanRepository(dir).get("fair")!;
    expect(view.review).toBeNull();
    expect(view.problems.join("\n")).toContain('"Print some posters" is not in the plan');
    expect(createPlanRepository(dir).list()[0]!.verdict.status).toBe("review_invalid");
  });

  it("refuses a review whose deadline the plan never states", () => {
    write("fair", PLAN, { ...goodReview, deadline_day: 99 });
    const view = createPlanRepository(dir).get("fair")!;
    expect(view.review).toBeNull();
    expect(view.problems.join("\n")).toContain("day 99");
  });

  it("refuses a review that breaks the contract, and one that is not JSON", () => {
    write("fair", PLAN, { deadline_day: 10, tasks: "none", findings: [] });
    expect(createPlanRepository(dir).get("fair")!.problems.join("\n")).toContain("tasks");
    writeFileSync(join(dir, "reviews", "fair.json"), "{oops");
    expect(createPlanRepository(dir).get("fair")!.problems.join("\n")).toMatch(/not valid JSON/);
  });

  it("reports late plans and cycles in the verdict", () => {
    const late = structuredClone(goodReview);
    late.tasks[2]!.duration_days = 12;
    write("late", PLAN, late);
    const cyclic = structuredClone(goodReview);
    cyclic.tasks[0]!.depends_on = ["T2"];
    write("cyclic", PLAN, cyclic);
    const verdicts = Object.fromEntries(
      createPlanRepository(dir)
        .list()
        .map((p) => [p.id, p.verdict]),
    );
    expect(verdicts.late).toMatchObject({ status: "late", end_day: 12, days_late: 2 });
    expect(verdicts.cyclic).toMatchObject({ status: "cycle" });
  });

  it("reads the real sample data without crashing, and flags the starter's bait reviews", () => {
    const repo = createPlanRepository(
      new URL("../../data", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    );
    const plans = repo.list();
    expect(plans.map((p) => p.id).sort()).toEqual([
      "harbour-run",
      "lantern-festival",
      "spring-market",
    ]);
    for (const plan of plans) expect(repo.get(plan.id)).not.toBeNull();
    // Until ./review regenerates them, the starter's stored reviews fail
    // verification (a made-up quote; a deadline taken from the injection).
    const stored = JSON.parse(
      readFileSync(new URL("../../data/reviews/lantern-festival.json", import.meta.url), "utf8"),
    );
    if (stored.meta === undefined) {
      expect(repo.get("lantern-festival")!.review).toBeNull();
      expect(repo.get("harbour-run")!.review).toBeNull();
    }
  });
});
