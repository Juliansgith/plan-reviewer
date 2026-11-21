// What Nora can do about each remark. The committee fixes its own plan, so
// every remark that needs them goes into her reply. Where code knows the
// options (which task in a circle goes first, which of the plan's dates is
// the deadline) she can try one with a click; otherwise the page takes her to
// the field to change. When her changes sort a remark out, it says so.

import type { Task } from "../core/contracts";
import type { ReviewFinding } from "../core/review/types";
import type { ScheduleResult } from "../core/schedule/types";
import type { Draft } from "./corrections";

export type FixAction =
  /** Try a change with one click. */
  | { kind: "apply"; label: string; draft: Draft }
  /** Open the task editor; focus is the id of the field to put the cursor in. */
  | { kind: "edit"; label: string; focus: string | null }
  /** Go to the timeline, where tasks can be dragged. */
  | { kind: "timeline"; label: string };

export type FixHelp = {
  /** What Nora can do, in plain words; null when there is nothing to add. */
  advice: string | null;
  actions: FixAction[];
  /** Set when her changes sort the remark out: what they did. */
  sorted: string | null;
};

export type FixContext = {
  original: Draft;
  current: Draft;
  originalSchedule: ScheduleResult;
  /** The schedule for `current`; null while it is being worked out. */
  currentSchedule: ScheduleResult | null;
  /** The deadlines the plan states, from its own words. */
  deadlineCandidates: readonly number[];
};

/** Ids of the editor fields a remark can send Nora to. */
export const fieldId = {
  deadline: "field-deadline",
  owner: (taskId: string) => `field-owner-${taskId}`,
};

const IN_REPLY = "It is in your reply.";
const quoted = (text: string) => `"${text}"`;
const MAX_CHOICES = 4;

function circleFix(group: readonly string[], ctx: FixContext): FixHelp {
  const members = new Set(group);
  const actions: FixAction[] = ctx.current.tasks
    .filter((task) => members.has(task.id))
    .slice(0, MAX_CHOICES)
    .map((first) => ({
      kind: "apply",
      label: `Do ${quoted(first.name)} first`,
      draft: {
        ...ctx.current,
        tasks: ctx.current.tasks.map((task) =>
          task.id === first.id
            ? { ...task, depends_on: task.depends_on.filter((id) => !members.has(id)) }
            : task,
        ),
      },
    }));
  const schedule = ctx.currentSchedule;
  const stillCircular =
    schedule === null ||
    (schedule.status === "cycle" &&
      schedule.cycle_groups.some((g) => g.some((id) => members.has(id))));
  return {
    advice:
      "Ask the committee which of these comes first. If you already know, choose it here to see the dates.",
    actions,
    sorted: stillCircular ? null : "These tasks no longer wait for each other.",
  };
}

function lateFix(ctx: FixContext): FixHelp {
  const timeline: FixAction = { kind: "timeline", label: "Go to the timeline" };
  const bound =
    ctx.originalSchedule.status === "scheduled" ? ctx.originalSchedule.proof.bound : null;
  let advice: string;
  if (bound?.kind === "owner_workload") {
    const who = bound.owner;
    advice = `${who} has too much to do alone. Drag one of ${who}'s tasks to someone else in the timeline, or ask the committee for a later date.`;
  } else if (bound?.kind === "dependency_chain") {
    advice =
      "The green tasks in the timeline happen one after another and take too long. Drag the end of one to shorten it, or ask the committee for a later date.";
  } else {
    advice = "Ask the committee for a later date, or change the tasks to see what would help.";
  }
  const schedule = ctx.currentSchedule;
  const deadline = ctx.current.deadline_day;
  const sorted =
    schedule?.status === "scheduled" && deadline !== null && schedule.end_day <= deadline
      ? `It now finishes on day ${schedule.end_day}, in time for day ${deadline}.`
      : null;
  return { advice, actions: [timeline], sorted };
}

const chosenDeadline = (ctx: FixContext) =>
  ctx.current.deadline_day === null
    ? null
    : `You chose day ${ctx.current.deadline_day} as the deadline.`;

function ownerFix(finding: ReviewFinding, ctx: FixContext): FixHelp {
  const name = /^No owner for "(.*)"$/.exec(finding.title)?.[1];
  const task = ctx.original.tasks.find((t) => t.owner === null && t.name === name);
  if (!task) return committeeOnly(finding);
  const now: Task | undefined = ctx.current.tasks.find((t) => t.id === task.id);
  return {
    advice:
      "Ask the committee who will do it. To see the effect, choose someone here, or drag it to a person in the timeline.",
    actions: [{ kind: "edit", label: "Choose who does it", focus: fieldId.owner(task.id) }],
    sorted: !now ? "You removed this task." : now.owner ? `${now.owner} does it now.` : null,
  };
}

function namesFix(finding: ReviewFinding, ctx: FixContext): FixHelp {
  const [, short, long] = /^"(.+?)" and "(.+?)"/.exec(finding.detail) ?? [];
  const owners = new Set(ctx.current.tasks.map((t) => t.owner));
  const merged = !!short && !!long && !(owners.has(short) && owners.has(long));
  return {
    advice:
      "Ask the committee. If they are the same person, give their tasks the same name here to see the dates.",
    actions: [{ kind: "edit", label: "Change tasks", focus: null }],
    sorted: merged ? "Their tasks now use one name." : null,
  };
}

function committeeOnly(finding: ReviewFinding): FixHelp {
  if (finding.severity === "note") return { advice: null, actions: [], sorted: null };
  return {
    advice:
      finding.kind === "instructions"
        ? `Nothing to change here. Ask the committee why it is in the plan. ${IN_REPLY}`
        : `Ask the committee about this. ${IN_REPLY}`,
    actions: [],
    sorted: null,
  };
}

export function fixesFor(findings: readonly ReviewFinding[], ctx: FixContext): FixHelp[] {
  // The review's circle remarks come in the order the scheduler finds the circles.
  const circles = ctx.originalSchedule.status === "cycle" ? ctx.originalSchedule.cycle_groups : [];
  let circle = 0;
  return findings.map((finding) => {
    switch (finding.kind) {
      case "cycle": {
        const group = circles[circle++];
        return group ? circleFix(group, ctx) : committeeOnly(finding);
      }
      case "late":
        return lateFix(ctx);
      case "deadline_conflict":
        return {
          advice:
            "Ask the committee which date is right. To see the dates against one, choose it here.",
          actions: ctx.deadlineCandidates.map((day) => ({
            kind: "apply" as const,
            label: `Use day ${day}`,
            draft: { ...ctx.current, deadline_day: day },
          })),
          sorted: chosenDeadline(ctx),
        };
      case "no_deadline":
        return {
          advice:
            "Ask the committee for the date. To see the dates against one, set a deadline here.",
          actions: [{ kind: "edit", label: "Set a deadline", focus: fieldId.deadline }],
          sorted: chosenDeadline(ctx),
        };
      case "no_owner":
        return ownerFix(finding, ctx);
      case "owner_names":
        return namesFix(finding, ctx);
      default:
        return committeeOnly(finding);
    }
  });
}
