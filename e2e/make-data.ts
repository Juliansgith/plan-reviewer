// Seeds a data folder for the browser tests: the three sample plans plus a
// small late plan, with reviews assembled by the real pipeline from
// hand-checked model answers (no API key needed). Lantern Festival keeps the
// starter's stored review, which fails verification, to test that state.
//
//   npx tsx e2e/make-data.ts <folder>

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewPlan } from "../src/core/review/review";
import type { ChatClient } from "../src/core/review/types";

const out = process.argv[2] ?? "test-results/e2e-data";
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "plans"), { recursive: true });
mkdirSync(join(out, "reviews"), { recursive: true });

const replay = (content: string): ChatClient => ({
  complete: async () => ({ content, model: "fixture", finishReason: "stop" }),
});

async function review(id: string, plan: string, answer: string) {
  writeFileSync(join(out, "plans", `${id}.md`), plan);
  const outcome = await reviewPlan(plan, replay(answer), { model: "fixture" });
  if (!outcome.ok) throw new Error(`${id}: ${outcome.errors.join("; ")}`);
  writeFileSync(join(out, "reviews", `${id}.json`), JSON.stringify(outcome.review, null, 2));
}

for (const id of ["spring-market", "harbour-run"]) {
  await review(
    id,
    readFileSync(`data/plans/${id}.md`, "utf8"),
    readFileSync(`src/core/review/__fixtures__/${id}.model.json`, "utf8"),
  );
}

copyFileSync("data/plans/lantern-festival.md", join(out, "plans", "lantern-festival.md"));
writeFileSync(
  join(out, "reviews", "lantern-festival.json"),
  JSON.stringify({
    deadline_day: 45,
    tasks: [
      {
        id: "T1",
        name: "Workshops",
        owner: "Priya",
        duration_days: 15,
        depends_on: [],
        quote: "Run lantern-making workshops in both of the schools",
      },
    ],
    findings: [],
  }),
);

const fair = `# Pellerby Test Fair

Submitted by the Test Committee.

Everything must be done by day 6.

| Task | Who | How long | Can start after |
|---|---|---|---|
| Book the hall | Ann | 3 days | - |
| Print posters | Ann | 4 days | Book the hall |
| Find stewards | Bob | 2 days | - |
`;
await review(
  "test-fair",
  fair,
  JSON.stringify({
    deadline_day: 6,
    deadline_quote: "Everything must be done by day 6.",
    tasks: [
      {
        id: "T1",
        name: "Book the hall",
        owner: "Ann",
        duration_days: 3,
        depends_on: [],
        quote: "Book the hall",
      },
      {
        id: "T2",
        name: "Print posters",
        owner: "Ann",
        duration_days: 4,
        depends_on: ["T1"],
        quote: "Print posters",
      },
      {
        id: "T3",
        name: "Find stewards",
        owner: "Bob",
        duration_days: 2,
        depends_on: [],
        quote: "Find stewards",
      },
    ],
    findings: [
      {
        title: "Two days for stewards may be short",
        detail: "Finding stewards usually takes longer.",
        quote: "Find stewards",
        severity: "warning",
      },
    ],
  }),
);
console.log(`e2e data ready in ${out}`);
