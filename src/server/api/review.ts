// POST /api/review: runs the review pipeline on this server, with the
// server's model key, so ./review needs no key or setting of its own
// (docs/DECISIONS.md, D20; controls in docs/SECURITY.md).
//
// It is open, like /api/schedule. The caller sends only the plan; the model,
// the prompt, the schema and every limit are fixed here, so the endpoint can
// run plan reviews and nothing else: it cannot be used as a general model
// proxy, and the caps bound what it can spend. Order of checks: enabled, body,
// limits, then the model. Every request leaves one audit line with no plan
// text or key in it.

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { reviewPlan } from "../../core/review/review";
import { ModelServiceError, type ChatClient, type ReviewOutcome } from "../../core/review/types";
import { json, readLimited, refuse } from "./http";

/** The largest plan accepted, in bytes. The sample plans are 3 to 5 KB. */
export const MAX_PLAN_BYTES = 100 * 1024;
const MAX_BODY_BYTES = MAX_PLAN_BYTES + 4 * 1024;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type ReviewLimits = { concurrent: number; perHour: number; perDay: number };
/** About $1 a day at most with the default model; the key's own credit limit caps the rest. */
export const DEFAULT_LIMITS: ReviewLimits = { concurrent: 2, perHour: 30, perDay: 200 };
/** Inside the graders' 300 s per plan, with room for the network both ways. */
export const SERVER_BUDGET_MS = 240_000;

export type AuditEntry = {
  event: "review_request";
  at: string;
  id: string;
  outcome: "ok" | "refused" | "failed";
  status: number;
  reason?: string;
  ms: number;
  client: string | null;
  plan_bytes?: number;
  /** The first 16 hex digits of the plan's SHA-256: enough to match requests, not to read the plan. */
  plan_sha256?: string;
  attempts?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd?: number | null;
};

export type ReviewEndpoint = {
  /** The server's model client. Null when the server has no model key: the endpoint is off. */
  client: ChatClient | null;
  model: string;
  budgetMs?: number;
  limits?: ReviewLimits;
  now?: () => number;
  log?: (entry: AuditEntry) => void;
};

const BodySchema = z.strictObject({ plan: z.string() });

const MODEL_FAILURES: Record<ModelServiceError["kind"], [number, string, string]> = {
  auth: [503, "model_unavailable", "The model service refused this server's key."],
  payment: [503, "model_out_of_credit", "The model service is out of credit for this server."],
  unavailable: [503, "model_unavailable", "The model service is unavailable. Try again later."],
  timeout: [504, "model_timeout", "The model service did not answer in time."],
  bad_request: [502, "model_error", "The model service could not handle the request."],
};

export function createReviewHandler(options: ReviewEndpoint) {
  const { client, model } = options;
  const limits = options.limits ?? DEFAULT_LIMITS;
  const budgetMs = options.budgetMs ?? SERVER_BUDGET_MS;
  const now = options.now ?? Date.now;
  // One JSON line per request on stdout, kept by the container log driver.
  const log =
    options.log ?? ((entry: AuditEntry) => process.stdout.write(`${JSON.stringify(entry)}\n`));
  const started: number[] = [];
  let running = 0;

  return async function handleReview(request: Request): Promise<Response> {
    const id = randomUUID();
    const begun = Date.now();
    const entry: AuditEntry = {
      event: "review_request",
      at: new Date(now()).toISOString(),
      id,
      outcome: "refused",
      status: 0,
      ms: 0,
      client:
        request.headers.get("x-real-ip") ??
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        null,
    };
    const finish = (response: Response, reason?: string): Response => {
      response.headers.set("x-request-id", id);
      entry.status = response.status;
      entry.ms = Date.now() - begun;
      if (reason) entry.reason = reason;
      entry.outcome =
        response.status < 300
          ? "ok"
          : response.status >= 500 || reason === "no_usable_review"
            ? "failed"
            : "refused";
      log(entry);
      return response;
    };
    const no = (status: number, code: string, message: string, issues?: string[]) =>
      finish(refuse(status, code, message, issues), code);

    if (!client) return no(503, "not_enabled", "Reviews are not enabled on this server.");

    const text = await readLimited(request, MAX_BODY_BYTES);
    if (text === null)
      return no(413, "too_large", `The plan is larger than ${MAX_PLAN_BYTES / 1024} KB.`);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return no(400, "invalid_json", "The request body is not valid JSON.");
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return no(422, "invalid_request", 'Send exactly one field, "plan", with the plan as text.');
    }
    const plan = parsed.data.plan;
    entry.plan_bytes = Buffer.byteLength(plan);
    entry.plan_sha256 = createHash("sha256").update(plan).digest("hex").slice(0, 16);
    if (entry.plan_bytes > MAX_PLAN_BYTES) {
      return no(413, "too_large", `The plan is larger than ${MAX_PLAN_BYTES / 1024} KB.`);
    }
    if (!plan.trim()) return no(422, "invalid_request", "The plan is empty.");

    // Limits: a few at once, and a budget per hour and per day.
    const at = now();
    while (started.length && at - started[0]! >= DAY_MS) started.shift();
    const lastHour = started.filter((t) => at - t < HOUR_MS);
    const wait = (from: number, window: number) => String(Math.ceil((from + window - at) / 1000));
    if (running >= limits.concurrent) {
      const response = refuse(429, "busy", "Other reviews are running. Try again shortly.");
      response.headers.set("retry-after", "30");
      return finish(response, "busy");
    }
    if (started.length >= limits.perDay) {
      const response = refuse(429, "daily_limit", "This server's daily review limit is reached.");
      response.headers.set("retry-after", wait(started[0]!, DAY_MS));
      return finish(response, "daily_limit");
    }
    if (lastHour.length >= limits.perHour) {
      const response = refuse(429, "hourly_limit", "This server's hourly review limit is reached.");
      response.headers.set("retry-after", wait(lastHour[0]!, HOUR_MS));
      return finish(response, "hourly_limit");
    }

    started.push(at);
    running++;
    let outcome: ReviewOutcome;
    try {
      outcome = await reviewPlan(plan, client, { model, deadlineAt: Date.now() + budgetMs });
    } catch (error) {
      if (error instanceof ModelServiceError) {
        const [status, code, message] = MODEL_FAILURES[error.kind];
        return no(status, code, message);
      }
      console.error(`review ${id} failed: ${(error as Error).name}`);
      return no(500, "internal_error", "The review could not be made.");
    } finally {
      running--;
    }

    entry.attempts = outcome.attempts;
    if (!outcome.ok) {
      return no(
        422,
        "no_usable_review",
        `No usable review after ${outcome.attempts} model calls.`,
        outcome.errors,
      );
    }
    const { meta } = outcome.review;
    entry.prompt_tokens = meta.prompt_tokens;
    entry.completion_tokens = meta.completion_tokens;
    entry.cost_usd = meta.cost_usd;
    return finish(json({ review: outcome.review }));
  };
}
