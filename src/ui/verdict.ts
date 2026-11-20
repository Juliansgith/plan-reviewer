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
  return spare > 0 ? `${days(spare)} to spare` : "with no days to spare";
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
    const sentence =
      cycle.length === 1
        ? `${cycle[0]} waits for itself.`
        : `${cycle[0]} waits for ${cycle
            .slice(1)
            .map((name, i) => (i === 0 ? name : `which waits for ${name}`))
            .join(", ")}, which waits for ${cycle[0]}.`;
    return {
      tone: "bad",
      label: "Blocked",
      headline: "Cannot be scheduled",
      sentence,
      reason:
        "Tasks that wait on each other in a circle can never start. The committee needs to say which comes first.",
      proof: null,
    };
  }

  const { end_day, proof } = schedule;
  const finish = proof.optimal
    ? `The earliest the work can finish is day ${end_day}.`
    : `The best schedule found finishes on day ${end_day}.`;
  const proofText = proof.optimal
    ? "Checked: no order of the tasks finishes sooner."
    : `Best found within the time limit. No order of the tasks can finish before day ${proof.lower_bound}.`;

  if (deadline_day === null) {
    const candidates = [...new Set(input.deadline_candidates)].sort((a, b) => a - b);
    const sentence =
      candidates.length >= 2
        ? `The plan gives ${COUNT_WORDS[candidates.length] ?? candidates.length} deadlines: ${listDays(candidates)}.`
        : candidates.length === 1
          ? `The plan mentions day ${candidates[0]}, but not clearly as the deadline.`
          : "The plan does not say by which day everything must be done.";
    const reason = candidates.length
      ? candidates
          .map((day) =>
            end_day > day
              ? `Against day ${day} it is ${days(end_day - day)} late.`
              : `Against day ${day} it is on time.`,
          )
          .join(" ")
      : null;
    return {
      tone: "neutral",
      label: "No clear deadline",
      headline: `Earliest finish: day ${end_day}`,
      sentence,
      reason,
      proof: proofText,
    };
  }

  const reason = reasonOf(proof.bound, proof.lower_bound, names);
  const sentence = `${finish} The deadline is day ${deadline_day}.`;
  if (end_day > deadline_day) {
    const late = days(end_day - deadline_day);
    return {
      tone: "bad",
      label: `${late} late`,
      headline: `${late} late`,
      sentence,
      reason,
      proof: proofText,
    };
  }
  return {
    tone: "good",
    label: "On time",
    headline:
      end_day < deadline_day
        ? `On time, ${spareText(deadline_day - end_day)}`
        : "On time, with no days to spare",
    sentence,
    reason,
    proof: proofText,
  };
}
