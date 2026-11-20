// The two fixed formats from docs/contracts.md, as zod schemas.
//
// These schemas are the single source of truth for both contracts: the API
// validates requests with them, ./review validates model output with them,
// and the TypeScript types the page uses are inferred from them.
//
// Both formats may carry extra fields (docs/contracts.md, "Contract checks"),
// so objects are "loose": unknown keys are accepted and kept.

import { z } from "zod";

export const MAX_TASKS = 60;
/** Generous caps that no real plan reaches; they bound memory and arithmetic. */
export const MAX_DURATION_DAYS = 1_000_000;
const MAX_ID_LENGTH = 200;
const MAX_TEXT_LENGTH = 2_000;

const id = z.string().max(MAX_ID_LENGTH, { error: `must be at most ${MAX_ID_LENGTH} characters` });

const taskShape = {
  id,
  name: z.string().max(MAX_TEXT_LENGTH),
  owner: z.string().max(MAX_ID_LENGTH).nullable(),
  duration_days: z
    .int({ error: "must be an integer of at least 1" })
    .min(1, { error: "must be an integer of at least 1" })
    .max(MAX_DURATION_DAYS, { error: `must be at most ${MAX_DURATION_DAYS}` }),
  depends_on: z.array(id),
};

export const TaskSchema = z.looseObject(taskShape);

/** Adds "unique id" and "known dependency" rules to any task list. */
function checkTaskGraph(
  tasks: readonly { id: string; depends_on: readonly string[] }[],
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  tasks.forEach((task, index) => {
    if (seen.has(task.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["tasks", index, "id"],
        message: `duplicate task id "${task.id}"`,
      });
    }
    seen.add(task.id);
  });
  const known = new Set(tasks.map((task) => task.id));
  tasks.forEach((task, index) => {
    task.depends_on.forEach((dependency, depIndex) => {
      if (!known.has(dependency)) {
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "depends_on", depIndex],
          message: `task "${task.id}" depends on unknown id "${dependency}"`,
        });
      }
    });
  });
}

export const ScheduleRequestSchema = z
  .looseObject(
    {
      tasks: z
        .array(TaskSchema)
        .max(MAX_TASKS, { error: `must contain at most ${MAX_TASKS} tasks` }),
      deadline_day: z.int({ error: "must be an integer" }),
    },
    { error: "request must be an object" },
  )
  .superRefine((request, ctx) => checkTaskGraph(request.tasks, ctx));

export const ReviewTaskSchema = z.looseObject({
  ...taskShape,
  quote: z.string(),
});

export const FindingSchema = z.looseObject({
  title: z.string(),
  detail: z.string(),
  quote: z.string().nullable(),
});

export const ReviewSchema = z
  .looseObject(
    {
      deadline_day: z.int({ error: "must be an integer or null" }).nullable(),
      tasks: z.array(ReviewTaskSchema),
      findings: z.array(FindingSchema),
    },
    { error: "review must be an object" },
  )
  .superRefine((review, ctx) => checkTaskGraph(review.tasks, ctx));

export type Task = z.infer<typeof TaskSchema>;
export type ScheduleRequest = z.infer<typeof ScheduleRequestSchema>;
export type ReviewTask = z.infer<typeof ReviewTaskSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Review = z.infer<typeof ReviewSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Formats a zod path like ["tasks", 3, "owner"] as "tasks[3].owner". */
export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, key) => {
    if (typeof key === "number") return `${text}[${key}]`;
    return text ? `${text}.${String(key)}` : String(key);
  }, "");
}

function toResult<T>(parsed: z.ZodSafeParseResult<T>): ParseResult<T> {
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors = parsed.error.issues.map((issue) => {
    const where = formatPath(issue.path);
    // Custom graph messages already name the task, so they read best alone.
    if (issue.code === "custom" || !where) return issue.message;
    return `${where} ${issue.message}`;
  });
  return { ok: false, errors };
}

export function parseScheduleRequest(input: unknown): ParseResult<ScheduleRequest> {
  return toResult(ScheduleRequestSchema.safeParse(input));
}

export function parseReview(input: unknown): ParseResult<Review> {
  return toResult(ReviewSchema.safeParse(input));
}
