// Nora's corrections: what she changed, in plain words, and what it did to
// the schedule. Corrections are saved in the browser per plan and dropped
// when the review they were made against is replaced.

import type { Task } from "../core/contracts";
import type { ScheduleResult } from "../core/schedule/types";
import { days, spareText } from "./verdict";

export type Draft = { deadline_day: number | null; tasks: Task[] };

export type Change =
  | { kind: "deadline"; from: number | null; to: number | null }
  | { kind: "removed"; task: Task }
  | { kind: "added"; task: Task }
  | { kind: "name"; task: Task; from: string }
  | { kind: "duration"; task: Task; from: number }
  | { kind: "owner"; task: Task; from: string | null }
  | { kind: "waits_for"; task: Task; added: boolean; other: string };

export function diffCorrections(original: Draft, edited: Draft): Change[] {
  const changes: Change[] = [];
  if (original.deadline_day !== edited.deadline_day) {
    changes.push({ kind: "deadline", from: original.deadline_day, to: edited.deadline_day });
  }
  const before = new Map(original.tasks.map((task) => [task.id, task]));
  const after = new Map(edited.tasks.map((task) => [task.id, task]));
  const nameOf = (id: string) => after.get(id)?.name ?? before.get(id)?.name ?? id;

  for (const task of original.tasks)
    if (!after.has(task.id)) changes.push({ kind: "removed", task });
  for (const old of original.tasks) {
    const task = after.get(old.id);
    if (!task) continue;
    if (task.name !== old.name) changes.push({ kind: "name", task, from: old.name });
    if (task.duration_days !== old.duration_days)
      changes.push({ kind: "duration", task, from: old.duration_days });
    if (task.owner !== old.owner) changes.push({ kind: "owner", task, from: old.owner });
    for (const id of task.depends_on) {
      if (!old.depends_on.includes(id))
        changes.push({ kind: "waits_for", task, added: true, other: nameOf(id) });
    }
    for (const id of old.depends_on) {
      if (!task.depends_on.includes(id))
        changes.push({ kind: "waits_for", task, added: false, other: nameOf(id) });
    }
  }
  for (const task of edited.tasks) if (!before.has(task.id)) changes.push({ kind: "added", task });
  return changes;
}

const dayOrNone = (value: number | null) => (value === null ? "none" : `day ${value}`);

export function describeChange(change: Change): string {
  switch (change.kind) {
    case "deadline":
      return `Deadline: ${dayOrNone(change.from)} → ${dayOrNone(change.to)}`;
    case "removed":
      return `Removed "${change.task.name}"`;
    case "added":
      return `Added "${change.task.name}"`;
    case "name":
      return `Renamed "${change.from}" to "${change.task.name}"`;
    case "duration":
      return `${change.task.name}: ${change.from} → ${change.task.duration_days} days`;
    case "owner":
      return `${change.task.name}: owner ${change.from ?? "nobody"} → ${change.task.owner ?? "nobody"}`;
    case "waits_for":
      return `${change.task.name}: ${change.added ? "now waits for" : "no longer waits for"} "${change.other}"`;
  }
}

function standing(end: number, deadline: number, before: number | null): string {
  const late = end > deadline;
  const wasLate = before !== null && before > deadline;
  if (late) return `${before === null ? "" : wasLate ? "Still " : "Now "}${days(end - deadline)} late.`;
  const prefix = before === null ? "On time" : wasLate ? "Now on time" : "Still on time";
  return `${prefix}, ${spareText(deadline - end)}.`;
}

/** One or two sentences on what the correction did to the end day. */
export function compareOutcomes(
  before: ScheduleResult,
  after: ScheduleResult,
  deadline: number | null,
): string {
  const circle = "some tasks wait on each other in a circle.";
  if (after.status === "cycle") {
    return before.status === "cycle"
      ? `Still cannot be scheduled: ${circle}`
      : `Now cannot be scheduled: ${circle}`;
  }
  if (before.status === "cycle") {
    const status = deadline === null ? "" : ` ${standing(after.end_day, deadline, null)}`;
    return `The circle is broken. Finishes on day ${after.end_day}.${status}`;
  }
  if (after.end_day === before.end_day)
    return `No change to the end day: still day ${after.end_day}.`;
  const difference = after.end_day - before.end_day;
  const direction = difference < 0 ? "sooner" : "later";
  const status = deadline === null ? "" : ` ${standing(after.end_day, deadline, before.end_day)}`;
  return `Finishes on day ${after.end_day} instead of day ${before.end_day}, ${days(Math.abs(difference))} ${direction}.${status}`;
}

export function nextTaskId(tasks: readonly Task[]): string {
  const numbers = tasks
    .map((task) => /^T(\d+)$/.exec(task.id)?.[1])
    .filter(Boolean)
    .map(Number);
  return `T${numbers.length ? Math.max(...numbers) + 1 : 1}`;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const keyFor = (planId: string) => `plan-reviewer:corrections:${planId}`;

export function saveCorrections(
  storage: StorageLike,
  planId: string,
  reviewStamp: string,
  draft: Draft,
  now: Date,
) {
  try {
    storage.setItem(
      keyFor(planId),
      JSON.stringify({ review: reviewStamp, savedAt: now.toISOString(), ...draft }),
    );
  } catch {
    // Private windows and blocked storage: corrections then last for this visit only.
  }
}

export function clearCorrections(storage: StorageLike, planId: string) {
  try {
    storage.removeItem(keyFor(planId));
  } catch {
    // Nothing to clear.
  }
}

export function loadCorrections(
  storage: StorageLike,
  planId: string,
  reviewStamp: string,
): (Draft & { savedAt: string }) | null {
  try {
    const raw = storage.getItem(keyFor(planId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Draft & { review: string; savedAt: string }>;
    if (
      saved.review !== reviewStamp ||
      !Array.isArray(saved.tasks) ||
      typeof saved.savedAt !== "string"
    )
      return null;
    const deadline = typeof saved.deadline_day === "number" ? saved.deadline_day : null;
    return { deadline_day: deadline, tasks: saved.tasks, savedAt: saved.savedAt };
  } catch {
    return null;
  }
}
