// The words at the top of a plan page: can it make its date, by how much it
// misses, why, and how sure we are. Plain and specific, per BRAND.md.

import type { Task } from "../core/contracts";
import type { BoundReason, ScheduleResult } from "../core/schedule/types";

export type Tone = "good" | "bad" | "neutral";

export type VerdictCopy = {
  tone: Tone;
  /** Short chip text for the plan list. */
  label: string;
  headline: string;
  sentence: string;
  reason: string | null;
  /** What the reason is: a cause ("Why"), an action ("What to do"), or plain (null). */
  reasonLabel: "Why" | "What to do" | null;
  proof: string | null;
};

export const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const quoted = (text: string) => `"${text}"`;
const COUNT_WORDS = ["", "one", "two", "three", "four", "five"];

export function listDays(values: readonly number[]): string {
  const items = values.map((d) => `day ${d}`);
  return items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function spareText(spare: number): string {
  return spare > 0 ? `with ${days(spare)} to spare` : "with no days to spare";
}

function reasonOf(
  bound: BoundReason,
  lowerBound: number,
  names: Map<string, string>,
): string | null {
  if (bound.kind === "owner_workload") {
    const start =
      bound.earliest_start > 0 ? ` None of it can start before day ${bound.earliest_start}.` : "";
    return `${bound.owner} has ${days(bound.work_days)} of work and can only do one task at a time.${start}`;
  }
  if (bound.kind === "dependency_chain") {
    const chain = bound.task_ids.map((id) => quoted(names.get(id) ?? id));
    if (chain.length === 1) return `The longest task, ${chain[0]}, takes ${days(lowerBound)}.`;
    return `The longest chain of tasks that wait on each other takes ${days(lowerBound)}: ${chain.join(", then ")}.`;
  }
  return null;
}

export function describeVerdict(input: {
  schedule: ScheduleResult;
  deadline_day: number | null;
  deadline_candidates: readonly number[];
  tasks: readonly Task[];
}): VerdictCopy {
  const { schedule, deadline_day } = input;
  const names = new Map(input.tasks.map((task) => [task.id, task.name]));

  if (schedule.status === "cycle") {
    const cycle = schedule.cycle.map((id) => quoted(names.get(id) ?? id));
    let sentence: string;
    if (cycle.length === 1) sentence = `${cycle[0]} waits for itself, so it can never start.`;
    else if (cycle.length === 2)
      sentence = `${cycle[0]} waits for ${cycle[1]}, and ${cycle[1]} waits for ${cycle[0]}, so neither can start.`;
    else
      sentence = `${cycle[0]} waits for ${cycle
        .slice(1)
        .map((name, i) => (i === 0 ? name : `which waits for ${name}`))
        .join(", ")}, which waits for ${cycle[0]}, so none of them can start.`;
    return {
      tone: "bad",
      label: "Can't be scheduled",
      headline: "Can't be scheduled",
      sentence,
      reason: "Ask the committee which of these should happen first.",
      reasonLabel: "What to do",
      proof: null,
    };
  }

  const { end_day, proof } = schedule;
  const earliest = proof.optimal
    ? `The earliest it can all be done is day ${end_day}.`
    : `The best order found finishes on day ${end_day}.`;
  const proofText = proof.optimal
    ? "We tried every possible order of the tasks. None finishes sooner."
    : `This is the best order found in the time available. Nothing can finish before day ${proof.lower_bound}.`;

  if (deadline_day === null) {
    const candidates = [...new Set(input.deadline_candidates)].sort((a, b) => a - b);
    const sentence =
      candidates.length >= 2
        ? `The plan gives ${COUNT_WORDS[candidates.length] ?? candidates.length} deadlines: ${listDays(candidates)}.`
        : candidates.length === 1
          ? `The plan mentions day ${candidates[0]}, but not clearly as the deadline.`
          : "The plan does not say by which day everything must be done.";
    const comparisons = candidates.map((day) =>
      end_day > day ? `${days(end_day - day)} late for day ${day}` : `on time for day ${day}`,
    );
    const finish = `The earliest it can all be done is day ${end_day}`;
    const reason = comparisons.length
      ? `${finish}: ${comparisons.length > 1 ? `${comparisons.slice(0, -1).join(", ")}, and ${comparisons.at(-1)}` : comparisons[0]}.`
      : `${finish}.`;
    return {
      tone: "neutral",
      label: "No clear deadline",
      headline: "No clear deadline",
      sentence,
      reason,
      reasonLabel: null,
      proof: proofText,
    };
  }

  const reason = reasonOf(proof.bound, proof.lower_bound, names);
  const sentence = `${earliest} The deadline is day ${deadline_day}.`;
  if (end_day > deadline_day) {
    const late = days(end_day - deadline_day);
    return {
      tone: "bad",
      label: `${late} late`,
      headline: `Will finish ${late} late`,
      sentence,
      reason,
      reasonLabel: reason ? "Why" : null,
      proof: proofText,
    };
  }
  return {
    tone: "good",
    label: "On time",
    headline: `On time, ${spareText(deadline_day - end_day)}`,
    sentence,
    reason,
    reasonLabel: reason ? "Why" : null,
    proof: proofText,
  };
}
