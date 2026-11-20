import type { ChatClient, ChatRequest, ChatResponse } from "../core/review/types";

export const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash-1017";

export type OpenRouterOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
};

export class OpenRouterClient implements ChatClient {
  constructor(_options: OpenRouterOptions) {}
  async complete(_request: ChatRequest): Promise<ChatResponse> {
    throw new Error("not implemented");
  }
}
