// Runs a review: ask the model, check the answer, send problems back for a
// repair round, and let code settle the rest. The model proposes; this code
// decides. An answer that cannot be verified is reported as a failure and is
// never returned as if it were right.

import { assembleReview } from "./assemble";
import { checkAnswer, parseModelJson } from "./check";
import { buildMessages, repairMessage, REVIEW_JSON_SCHEMA } from "./prompt";
import { reasoningParam, type ChatClient, type ReviewOptions, type ReviewOutcome } from "./types";

export const DEFAULT_MAX_ATTEMPTS = 3;
/** ./review gets 300 s per plan from the graders; leave room to start and write. */
export const DEFAULT_BUDGET_MS = 270_000;
const MAX_CALL_MS = 150_000;
const MAX_OUTPUT_TOKENS = 16_000;

export async function reviewPlan(
  plan: string,
  client: ChatClient,
  options: ReviewOptions,
): Promise<ReviewOutcome> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const deadlineAt = options.deadlineAt ?? Date.now() + DEFAULT_BUDGET_MS;
  const now = options.now ?? (() => new Date());
  const messages = buildMessages(plan);
  const usage = { prompt: 0, completion: 0, cost: 0 as number | null };
  let servedBy = options.model;
  let errors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) {
      return {
        ok: false,
        errors: [...errors, "Ran out of time before the model gave a usable answer."],
        attempts: attempt - 1,
      };
    }

    const response = await client.complete({
      model: options.model,
      messages,
      responseFormat: REVIEW_JSON_SCHEMA,
      temperature: 0,
      maxTokens: MAX_OUTPUT_TOKENS,
      reasoning: reasoningParam(options.reasoning ?? "off"),
      signal: AbortSignal.timeout(Math.min(remaining, MAX_CALL_MS)),
    });
    servedBy = response.model || servedBy;
    usage.prompt += response.usage?.promptTokens ?? 0;
    usage.completion += response.usage?.completionTokens ?? 0;
    const cost = response.usage?.cost;
    usage.cost =
      usage.cost === null || cost === undefined || cost === null ? null : usage.cost + cost;

    const cutOff = response.finishReason === "length";
    if (cutOff) {
      errors = ["The answer was cut off before it was complete."];
    } else {
      const parsed = parseModelJson(response.content);
      if (!parsed.ok) {
        errors = [parsed.error];
      } else {
        const checked = checkAnswer(plan, parsed.value, { lastAttempt: attempt === maxAttempts });
        if (checked.ok) {
          const review = assembleReview(plan, checked.answer, {
            model: servedBy,
            attempts: attempt,
            prompt_tokens: usage.prompt,
            completion_tokens: usage.completion,
            cost_usd: usage.cost === null ? null : Number(usage.cost.toFixed(6)),
            generated_at: now().toISOString(),
          });
          return { ok: true, review, attempts: attempt };
        }
        errors = checked.errors;
      }
    }

    if (attempt < maxAttempts) {
      options.onRepair?.(attempt, errors);
      // A cut-off answer has nothing worth repairing: ask again from the start.
      if (!cutOff) {
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: repairMessage(errors) });
      }
    }
  }
  return { ok: false, errors, attempts: maxAttempts };
}
