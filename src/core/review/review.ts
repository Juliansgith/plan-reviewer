import type { ChatClient, ReviewOptions, ReviewOutcome } from "./types";

export async function reviewPlan(
  _plan: string,
  _client: ChatClient,
  _options: ReviewOptions,
): Promise<ReviewOutcome> {
  throw new Error("not implemented");
}
