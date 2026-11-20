// ./review <plan.md> <out.json>
//
// Exit codes (docs/contracts.md: "When ./review cannot produce a review, it
// exits with a non-zero status. We then do not read the output file."):
//   0  review written
//   1  no usable review: the model's answers failed verification
//   2  usage or setup problem: arguments, plan file, API key, output path
//   3  model service problem: OpenRouter unavailable, out of credit, timeout
// On any non-zero exit no output file is written; writes are atomic.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_BUDGET_MS, reviewPlan } from "../core/review/review";
import { ModelServiceError, REASONING_LEVELS, type Reasoning } from "../core/review/types";
import { DEFAULT_MODEL, OpenRouterClient } from "./openrouter";

export type CommandIo = {
  stderr: (line: string) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const USAGE = `Usage: ./review <plan.md> <out.json>

Reviews an event plan with a model and writes the review as JSON.

Environment:
  OPENROUTER_API_KEY      required; get one at https://openrouter.ai/keys
  REVIEW_MODEL            optional; default ${DEFAULT_MODEL}
  REVIEW_TIMEOUT_SECONDS  optional; default ${DEFAULT_BUDGET_MS / 1000}
  REVIEW_REASONING        optional; off (default), low, medium or high

Exit codes: 0 written, 1 no usable review, 2 usage or setup problem,
3 model service problem. No file is written unless the exit code is 0.`;

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function runReviewCommand(
  args: string[],
  env: Record<string, string | undefined>,
  io: CommandIo,
): Promise<number> {
  if (args.includes("-h") || args.includes("--help")) {
    io.stderr(USAGE);
    return 0;
  }
  if (args.length !== 2) {
    io.stderr(USAGE);
    return 2;
  }
  const [planPath, outPath] = args as [string, string];

  let plan: string;
  try {
    plan = readFileSync(planPath, "utf8");
  } catch (error) {
    io.stderr(`Cannot read the plan file ${planPath}: ${(error as Error).message}`);
    return 2;
  }
  if (!plan.trim()) {
    io.stderr(`The plan file ${planPath} is empty.`);
    return 2;
  }

  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    io.stderr(
      "OPENROUTER_API_KEY is not set. Get a key at https://openrouter.ai/keys and export it.",
    );
    return 2;
  }
  const model = env.REVIEW_MODEL?.trim() || DEFAULT_MODEL;
  const reasoning = (env.REVIEW_REASONING?.trim().toLowerCase() || "off") as Reasoning;
  if (!REASONING_LEVELS.includes(reasoning)) {
    io.stderr(`REVIEW_REASONING must be one of ${REASONING_LEVELS.join(", ")}.`);
    return 2;
  }
  const seconds = Number(env.REVIEW_TIMEOUT_SECONDS);
  const budgetMs =
    Number.isFinite(seconds) && seconds >= 10 ? Math.min(seconds, 3600) * 1000 : DEFAULT_BUDGET_MS;

  const client = new OpenRouterClient({
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || undefined,
    fetch: io.fetch,
    sleep: io.sleep,
  });

  io.stderr(`Reviewing ${planPath} with ${model} ...`);
  let outcome;
  try {
    outcome = await reviewPlan(plan, client, {
      model,
      reasoning,
      deadlineAt: Date.now() + budgetMs,
      onRepair: (attempt, errors) => {
        io.stderr(
          `Answer ${attempt} had ${count(errors.length, "problem")}; asking the model to fix them:`,
        );
        for (const error of errors) io.stderr(`  - ${error}`);
      },
    });
  } catch (error) {
    if (error instanceof ModelServiceError) {
      io.stderr(error.message);
      return error.kind === "auth" ? 2 : 3;
    }
    io.stderr(`Internal error: ${(error as Error).stack ?? String(error)}`);
    return 1;
  }

  if (!outcome.ok) {
    io.stderr(
      `No usable review after ${outcome.attempts} model call${outcome.attempts === 1 ? "" : "s"}. Problems with the last answer:`,
    );
    for (const error of outcome.errors) io.stderr(`  - ${error}`);
    return 1;
  }

  const { review } = outcome;
  const temporary = `${outPath}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(review, null, 2)}\n`, "utf8");
    renameSync(temporary, outPath);
  } catch (error) {
    rmSync(temporary, { force: true });
    io.stderr(`Cannot write ${outPath}: ${(error as Error).message}`);
    return 2;
  }

  const blockers = review.findings.filter((finding) => finding.severity === "blocker").length;
  const cost = review.meta.cost_usd === null ? "" : `, cost $${review.meta.cost_usd.toFixed(4)}`;
  io.stderr(
    `Wrote ${outPath}: ${count(review.tasks.length, "task")}, ${count(review.findings.length, "finding")} (${count(blockers, "blocker")}), ` +
      `deadline ${review.deadline_day === null ? "not clear" : `day ${review.deadline_day}`}, ` +
      `${review.meta.attempts} model call${review.meta.attempts === 1 ? "" : "s"}${cost}.`,
  );
  return 0;
}
