// A small client for OpenRouter's chat completions API, which is
// OpenAI-compatible. Plain fetch, no SDK: one endpoint, and every behaviour
// that matters (retries, error classes, key redaction) is in this file.
//
// Structured output: response_format json_schema with strict: true, plus
// provider.require_parameters so OpenRouter only routes to providers that
// honour the schema. Code still validates every answer (src/core/review).

import {
  ModelServiceError,
  type ChatClient,
  type ChatRequest,
  type ChatResponse,
} from "../core/review/types";

/**
 * DeepSeek V4.1 Flash, pinned to its 2026-10-17 snapshot so the graders run
 * the model we tested. Cheap ($0.15 / $0.60 per million tokens) and supports
 * structured outputs. See docs/DECISIONS.md, D5.
 */
export const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash-1017";
export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export type OpenRouterOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Retries after the first try, for rate limits, server errors and network failures. */
  maxRetries?: number;
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 30_000;

type CompletionBody = {
  model?: string;
  choices?: { message?: { content?: unknown }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number | null };
  error?: { code?: number | string; message?: string };
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
      .join("");
  }
  return "";
}

export class OpenRouterClient implements ChatClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(options: OpenRouterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 3;
  }

  private redact(text: string): string {
    return this.apiKey ? text.split(this.apiKey).join("[redacted]") : text;
  }

  private fail(status: number, message: string, model: string): never {
    const detail = this.redact(message || "no details");
    if (status === 401 || status === 403) {
      throw new ModelServiceError(
        `OpenRouter refused the API key (${status}: ${detail}). Check OPENROUTER_API_KEY.`,
        "auth",
      );
    }
    if (status === 402) {
      throw new ModelServiceError(
        `OpenRouter says the account has no credit left (402: ${detail}).`,
        "payment",
      );
    }
    if (RETRYABLE.has(status)) {
      throw new ModelServiceError(
        `OpenRouter is unavailable (${status}: ${detail}). Try again later.`,
        "unavailable",
      );
    }
    throw new ModelServiceError(
      `OpenRouter rejected the request (${status}: ${detail}). The model "${model}" may not support structured output; try another REVIEW_MODEL.`,
      "bad_request",
    );
  }

  async complete(request: ChatRequest): Promise<ChatResponse> {
    const body = JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      response_format: { type: "json_schema", json_schema: request.responseFormat },
      provider: { require_parameters: true },
      ...(request.reasoning && { reasoning: request.reasoning }),
    });

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < this.maxRetries;
      const backoff = 1000 * 2 ** attempt;
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "Plan reviewer",
          },
          body,
          signal: request.signal,
        });
      } catch (error) {
        const name = (error as Error).name;
        if (name === "TimeoutError" || name === "AbortError" || request.signal?.aborted) {
          throw new ModelServiceError("The model did not answer in time.", "timeout");
        }
        if (canRetry) {
          await this.sleep(backoff);
          continue;
        }
        throw new ModelServiceError(
          `Could not reach OpenRouter: ${this.redact((error as Error).message)}`,
          "unavailable",
        );
      }

      let parsed: CompletionBody | null = null;
      try {
        parsed = (await response.json()) as CompletionBody;
      } catch {
        parsed = null;
      }

      const embedded = parsed?.error;
      const status = !response.ok ? response.status : embedded ? Number(embedded.code) || 502 : 0;
      if (status) {
        if (RETRYABLE.has(status) && canRetry) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await this.sleep(
            retryAfter > 0 ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS) : backoff,
          );
          continue;
        }
        this.fail(status, embedded?.message ?? "", request.model);
      }
      if (!parsed) {
        if (canRetry) {
          await this.sleep(backoff);
          continue;
        }
        throw new ModelServiceError("OpenRouter sent a response that was not JSON.", "unavailable");
      }

      const choice = parsed.choices?.[0];
      return {
        content: textOf(choice?.message?.content),
        model: parsed.model ?? request.model,
        finishReason: choice?.finish_reason ?? null,
        ...(parsed.usage && {
          usage: {
            promptTokens: parsed.usage.prompt_tokens ?? 0,
            completionTokens: parsed.usage.completion_tokens ?? 0,
            cost: parsed.usage.cost ?? null,
          },
        }),
      };
    }
  }
}
