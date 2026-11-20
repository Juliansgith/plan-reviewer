// npm run eval: reviews the three sample plans with one or more models and
// scores each review against the facts in docs/INVESTIGATION.md.
//
//   OPENROUTER_API_KEY=... EVAL_MODELS="model-a,model-b" npm run eval
//
// Writes eval-results/<timestamp>.json and prints a summary table. This
// spends a few cents per model; it is not part of `npm test`.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { scoreReview, EXPECTATIONS } from "../core/review/eval";
import { reviewPlan } from "../core/review/review";
import { ModelServiceError } from "../core/review/types";
import { DEFAULT_MODEL, OpenRouterClient } from "../server/openrouter";

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is not set.");
  process.exit(2);
}
const models = (process.env.EVAL_MODELS ?? DEFAULT_MODEL)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const client = new OpenRouterClient({ apiKey, baseUrl: process.env.OPENROUTER_BASE_URL });

type Row = {
  model: string;
  plan: string;
  ok: boolean;
  passed: number;
  total: number;
  failed: string[];
  attempts: number;
  seconds: number;
  cost: number | null;
  error?: string;
};
const rows: Row[] = [];

for (const model of models) {
  for (const planName of Object.keys(EXPECTATIONS)) {
    const text = readFileSync(`data/plans/${planName}.md`, "utf8");
    const started = Date.now();
    try {
      const outcome = await reviewPlan(text, client, { model });
      const seconds = (Date.now() - started) / 1000;
      if (!outcome.ok) {
        rows.push({
          model,
          plan: planName,
          ok: false,
          passed: 0,
          total: 0,
          failed: outcome.errors,
          attempts: outcome.attempts,
          seconds,
          cost: null,
        });
        continue;
      }
      const checks = scoreReview(planName, outcome.review);
      rows.push({
        model,
        plan: planName,
        ok: true,
        passed: checks.filter((c) => c.pass).length,
        total: checks.length,
        failed: checks
          .filter((c) => !c.pass)
          .map((c) => (c.detail ? `${c.name} (${c.detail})` : c.name)),
        attempts: outcome.attempts,
        seconds,
        cost: outcome.review.meta.cost_usd,
      });
    } catch (error) {
      const message = error instanceof ModelServiceError ? error.message : String(error);
      rows.push({
        model,
        plan: planName,
        ok: false,
        passed: 0,
        total: 0,
        failed: [],
        attempts: 0,
        seconds: (Date.now() - started) / 1000,
        cost: null,
        error: message,
      });
    }
    const row = rows[rows.length - 1]!;
    console.log(
      `${model.padEnd(42)} ${planName.padEnd(17)} ${row.ok ? `${row.passed}/${row.total}` : "FAILED"}  ${row.attempts} call(s)  ${row.seconds.toFixed(1)} s${row.cost === null ? "" : `  $${row.cost.toFixed(4)}`}`,
    );
    for (const failure of row.failed) console.log(`    - ${failure}`);
    if (row.error) console.log(`    ! ${row.error}`);
  }
}

console.log("\nSummary");
for (const model of models) {
  const mine = rows.filter((row) => row.model === model);
  const passed = mine.reduce((sum, row) => sum + row.passed, 0);
  const total = mine.reduce((sum, row) => sum + row.total, 0) || 1;
  const cost = mine.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  const seconds = mine.reduce((sum, row) => sum + row.seconds, 0);
  console.log(
    `${model.padEnd(42)} ${((100 * passed) / total).toFixed(0).padStart(3)}% facts  ${mine.filter((r) => r.ok).length}/${mine.length} usable  ${seconds.toFixed(0)} s  $${cost.toFixed(4)}`,
  );
}

mkdirSync("eval-results", { recursive: true });
const file = `eval-results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`\nSaved ${file}`);
