import type { ChatMessage, JsonSchemaFormat } from "./types";

export const REVIEW_JSON_SCHEMA: JsonSchemaFormat = { name: "plan_review", strict: true, schema: {} };

export function buildMessages(_plan: string): ChatMessage[] {
  throw new Error("not implemented");
}
