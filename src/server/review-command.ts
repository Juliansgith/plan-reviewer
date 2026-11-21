// ./review <plan.md> <out.json>
//
// By default it sends the plan to the review server, which holds the model
// key (D20), so it needs no key or setting, and checks the review it gets back
// against the plan before writing it, as the page does with stored reviews.
// REVIEW_LOCAL=1 with OPENROUTER_API_KEY calls the model directly instead.
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
import { parseReview } from "../core/contracts";
import { DEFAULT_BUDGET_MS, reviewPlan } from "../core/review/review";
import {
  ModelServiceError,
  REASONING_LEVELS,
  type Reasoning,
  type StoredReview,
} from "../core/review/types";
import { checkReviewAgainstPlan } from "../core/review/verify";
import { DEFAULT_MODEL, OpenRouterClient } from "./openrouter";
import { DEFAULT_REVIEW_SERVER, requestRemoteReview, reviewEndpoint } from "./remote-review";

export type CommandIo = {
  stderr: (line: string) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const USAGE = `Usage: ./review <plan.md> <out.json>

Reviews an event plan with a model and writes the review as JSON.

No setup needed: the plan is reviewed on the review server, which holds the
model key, and the result is checked against the plan before it is written.

Environment (all optional):
  REVIEW_API_URL          the review server; default ${DEFAULT_REVIEW_SERVER}
  REVIEW_TIMEOUT_SECONDS  default ${DEFAULT_BUDGET_MS / 1000}
To call the model from this computer instead:
  REVIEW_LOCAL=1          with
  OPENROUTER_API_KEY      get one at https://openrouter.ai/keys
  REVIEW_MODEL            default ${DEFAULT_MODEL}
  REVIEW_REASONING        off (default), low, medium or high

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

  const local = /^(1|true|yes)$/i.test(env.REVIEW_LOCAL?.trim() ?? "");
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (local && !apiKey) {
    io.stderr(
      "REVIEW_LOCAL=1 calls the model from this computer, which needs OPENROUTER_API_KEY " +
        "(get a key at https://openrouter.ai/keys). Without REVIEW_LOCAL, the review server is used.",
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

  if (!local || !apiKey) {
    return reviewOnServer(plan, planPath, outPath, {
      server: env.REVIEW_API_URL?.trim() || DEFAULT_REVIEW_SERVER,
      timeoutMs: budgetMs,
      io,
    });
  }

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

  return writeReview(outcome.review, outPath, io);
}

async function reviewOnServer(
  plan: string,
  planPath: string,
  outPath: string,
  options: { server: string; timeoutMs: number; io: CommandIo },
): Promise<number> {
  const { io } = options;
  const endpoint = reviewEndpoint(options.server);
  if (typeof endpoint === "string") {
    io.stderr(endpoint);
    return 2;
  }
  io.stderr(`Reviewing ${planPath} on the review server ${endpoint.host} ...`);
  const result = await requestRemoteReview(plan, {
    endpoint,
    fetch: io.fetch ?? fetch,
    timeoutMs: options.timeoutMs,
  });
  if (!result.ok) {
    for (const line of result.lines) io.stderr(line);
    return result.exit;
  }

  // The server is trusted no more than the model: check before writing.
  const parsed = parseReview(result.review);
  const problems = parsed.ok
    ? checkReviewAgainstPlan(plan, parsed.value)
    : parsed.errors.map((e) => `It breaks the contract: ${e}`);
  if (problems.length) {
    io.stderr("The review server's answer failed the checks, so nothing was written:");
    for (const problem of problems) io.stderr(`  - ${problem}`);
    return 1;
  }
  return writeReview(result.review as StoredReview, outPath, io);
}

function writeReview(review: StoredReview, outPath: string, io: CommandIo): number {
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
  const meta = review.meta as Partial<StoredReview["meta"]> | undefined;
  const calls = meta?.attempts;
  const cost = typeof meta?.cost_usd === "number" ? `, cost $${meta.cost_usd.toFixed(4)}` : "";
  io.stderr(
    `Wrote ${outPath}: ${count(review.tasks.length, "task")}, ${count(review.findings.length, "finding")} (${count(blockers, "blocker")}), ` +
      `deadline ${review.deadline_day === null ? "not clear" : `day ${review.deadline_day}`}` +
      `${calls ? `, ${count(calls, "model call")}` : ""}${cost}.`,
  );
  return 0;
}
