// Types for the review pipeline and the model client it talks to.

import type { ReviewTask } from "../contracts";

export type Severity = "blocker" | "warning" | "note";

/** "model" for the model's own findings; the rest are added by code. */
export type FindingKind =
  | "model"
  | "cycle"
  | "late"
  | "deadline_conflict"
  | "no_deadline"
  | "instructions"
  | "no_owner"
  | "owner_names";

export type ReviewFinding = {
  title: string;
  detail: string;
  quote: string | null;
  severity: Severity;
  source: "model" | "code";
  kind: FindingKind;
  /** Set when the model's quote could not be found in the plan and was removed. */
  quote_removed?: true;
};

export type DeadlineStatement = { day: number; quote: string };

/**
 * What ./review writes: the contract's fields plus a few extra ones.
 * Spelled out rather than built with Omit<Review, ...>: Review comes from a
 * loose zod object with an index signature, and Omit over that loses the
 * named fields' types.
 */
export type StoredReview = {
  deadline_day: number | null;
  tasks: ReviewTask[];
  findings: ReviewFinding[];
  deadline_quote: string | null;
  deadline_statements: DeadlineStatement[];
  meta: {
    model: string;
    attempts: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number | null;
    generated_at: string;
  };
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type JsonSchemaFormat = { name: string; strict: boolean; schema: Record<string, unknown> };

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  responseFormat: JsonSchemaFormat;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
};

export type ChatUsage = { promptTokens: number; completionTokens: number; cost?: number | null };

export type ChatResponse = {
  content: string;
  model: string;
  finishReason: string | null;
  usage?: ChatUsage;
};

export interface ChatClient {
  complete(request: ChatRequest): Promise<ChatResponse>;
}

/** The model service failed; not the model's answer. Maps to exit code 2 or 3. */
export class ModelServiceError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "payment" | "bad_request" | "unavailable" | "timeout",
  ) {
    super(message);
    this.name = "ModelServiceError";
  }
}

export type ReviewOptions = {
  model: string;
  /** Model calls before giving up; the first plus repairs. */
  maxAttempts?: number;
  /** Absolute time (ms since epoch) by which the review must be done. */
  deadlineAt?: number;
  /** Called when an answer is sent back for repair, with that answer's problems. */
  onRepair?: (attempt: number, errors: string[]) => void;
  now?: () => Date;
};

export type ReviewOutcome =
  | { ok: true; review: StoredReview; attempts: number }
  | { ok: false; errors: string[]; attempts: number };
