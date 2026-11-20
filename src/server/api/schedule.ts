// POST /api/schedule (docs/contracts.md, "Scheduling").
//
// Accepts any content type as long as the body is JSON: fetch() with a
// string body says text/plain and curl -d says form-urlencoded, and refusing
// valid JSON over a header helps nobody. Everything else is strict.

import { parseScheduleRequest } from "../../core/contracts";
import { scheduleTasks } from "../../core/schedule/schedule";
import { json, readLimited, refuse } from "./http";

/** 60 tasks with long names fit in a few kilobytes; this leaves ample room. */
export const MAX_BODY_BYTES = 256 * 1024;

export async function handleSchedule(request: Request): Promise<Response> {
  const text = await readLimited(request, MAX_BODY_BYTES);
  if (text === null) {
    return refuse(
      413,
      "too_large",
      `The request body is too large; the limit is ${MAX_BODY_BYTES / 1024} KB.`,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return refuse(
      400,
      "invalid_json",
      `The request body is not valid JSON: ${(error as Error).message}`,
    );
  }

  const parsed = parseScheduleRequest(body);
  if (!parsed.ok) {
    return refuse(
      422,
      "invalid_request",
      "The request does not match the schedule contract.",
      parsed.errors,
    );
  }

  try {
    return json(scheduleTasks(parsed.value));
  } catch (error) {
    console.error("schedule failed", error);
    return refuse(500, "internal_error", "The schedule could not be computed.");
  }
}
