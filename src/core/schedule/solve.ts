// Finds the earliest finish for a plan where tasks wait for their
// dependencies and each person does one task at a time.
//
// The problem is NP-hard in general (it contains job-shop scheduling), but
// plans here have at most 60 tasks, so we can afford to be exact most of the
// time and honest when we are not:
//
//   1. Lower bound (bounds.ts): a day no schedule can beat, with a reason.
//   2. Heuristics: list scheduling under several priority rules plus seeded
//      random variants, each improved by forward-backward passes (re-packing
//      the schedule to the right, then back to the left). If one reaches the
//      lower bound, it is optimal and we stop.
//   3. Branch and bound: enumerate "active" schedules (Giffler & Thompson):
//      at each step take the unplaced task that could finish first, and branch
//      only on the tasks of the same owner that could start before it ends.
//      Every optimal plan has an active equivalent, so a finished search
//      proves optimality. Nodes whose bound cannot beat the best schedule so
//      far are cut. The search stops at a time or node limit, and the answer
//      then says it is the best found, with the gap to the bound.
//
// Tasks without an owner never wait for a person, so they are always placed
// as soon as their dependencies end and never branched on.

import {
  chainBound,
  ownerBound,
  ownerBoundValue,
  tasksByOwnerAndTail,
  type ChainBound,
  type OwnerBound,
} from "./bounds";
import { computeHeads, computeTails, topologicalOrder, type Graph } from "./graph";

export type SolveLimits = { timeLimitMs: number; nodeLimit: number };

export type Solution = {
  start: number[];
  makespan: number;
  lowerBound: number;
  chain: ChainBound;
  owner: OwnerBound | null;
  optimal: boolean;
  method: "bound_met_by_heuristic" | "branch_and_bound" | "best_found_within_limit";
  nodes: number;
};

type Candidate = { start: number[]; makespan: number };

const now = () => performance.now();

/** A dependency-respecting order: among ready tasks, always take the highest score. */
function priorityList(graph: Graph, score: (task: number) => number): number[] {
  const remaining = graph.preds.map((list) => list.length);
  const ready: number[] = [];
  for (let i = 0; i < graph.n; i++) if (remaining[i] === 0) ready.push(i);
  const list: number[] = [];
  while (ready.length) {
    let pick = 0;
    for (let k = 1; k < ready.length; k++) {
      const a = ready[k]!;
      const b = ready[pick]!;
      const sa = score(a);
      const sb = score(b);
      if (sa > sb || (sa === sb && a < b)) pick = k;
    }
    const v = ready[pick]!;
    ready[pick] = ready[ready.length - 1]!;
    ready.pop();
    list.push(v);
    for (const s of graph.succs[v]!) if (--remaining[s]! === 0) ready.push(s);
  }
  return list;
}

/**
 * Serial schedule generation: place tasks in list order, each as early as its
 * dependencies allow and in the first gap its owner has free.
 * With `reversed`, dependencies point the other way (used for backward passes).
 */
function serialSchedule(graph: Graph, list: readonly number[], reversed = false): Candidate {
  const preds = reversed ? graph.succs : graph.preds;
  const start = new Array<number>(graph.n).fill(0);
  const busy: number[][] = graph.owners.map(() => []);
  let makespan = 0;
  for (const v of list) {
    const duration = graph.duration[v]!;
    let s = 0;
    for (const p of preds[v]!) s = Math.max(s, start[p]! + graph.duration[p]!);
    const k = graph.machine[v]!;
    if (k >= 0) {
      const intervals = busy[k]!;
      let insertAt = intervals.length;
      for (let j = 0; j < intervals.length; j += 2) {
        const busyStart = intervals[j]!;
        const busyEnd = intervals[j + 1]!;
        if (busyEnd <= s) continue;
        if (s + duration <= busyStart) {
          insertAt = j;
          break;
        }
        s = Math.max(s, busyEnd);
      }
      intervals.splice(insertAt, 0, s, s + duration);
    }
    start[v] = s;
    makespan = Math.max(makespan, s + duration);
  }
  return { start, makespan };
}

const byKey = (keys: readonly number[]) => (a: number, b: number) => keys[a]! - keys[b]! || a - b;

/** Forward-backward improvement: pack right, then pack left, while it helps. */
function improve(graph: Graph, candidate: Candidate): Candidate {
  let best = candidate;
  const indices = Array.from({ length: graph.n }, (_, i) => i);
  for (let round = 0; round < 6; round++) {
    const negativeFinish = best.start.map((s, i) => -(s + graph.duration[i]!));
    const backward = serialSchedule(graph, [...indices].sort(byKey(negativeFinish)), true);
    const mirrored = backward.start.map((s, i) => backward.makespan - s - graph.duration[i]!);
    const forward = serialSchedule(graph, [...indices].sort(byKey(mirrored)));
    if (forward.makespan >= best.makespan) break;
    best = forward;
  }
  return best;
}

/** Small deterministic random number generator (mulberry32), so results repeat. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runHeuristics(
  graph: Graph,
  heads: readonly number[],
  tails: readonly number[],
  lowerBound: number,
  stopAt: number,
): Candidate {
  const { duration, machine } = graph;
  const remainingPath = (i: number) => tails[i]! + duration[i]!;
  const ownerLoad = graph.owners.map(() => 0);
  for (let i = 0; i < graph.n; i++) if (machine[i]! >= 0) ownerLoad[machine[i]!]! += duration[i]!;

  const rules: ((i: number) => number)[] = [
    remainingPath,
    (i) => -heads[i]! * 1e9 + remainingPath(i),
    (i) => remainingPath(i) + (machine[i]! >= 0 ? ownerLoad[machine[i]!]! : 0),
    (i) => graph.succs[i]!.length * 1e9 + remainingPath(i),
  ];

  let best: Candidate | null = null;
  const consider = (list: number[]) => {
    const candidate = improve(graph, serialSchedule(graph, list));
    if (!best || candidate.makespan < best.makespan) best = candidate;
  };
  for (const rule of rules) {
    consider(priorityList(graph, rule));
    if (best!.makespan <= lowerBound) return best!;
  }

  // Seeded random perturbations of the strongest rule. A fixed count keeps
  // answers identical across machines; the clock is only a safety stop.
  const random = seededRandom(20261120);
  const iterations = graph.n <= 80 ? 120 : 8;
  for (let k = 0; k < iterations && now() < stopAt; k++) {
    const noise = Array.from({ length: graph.n }, () => 0.5 + random());
    consider(priorityList(graph, (i) => remainingPath(i) * noise[i]!));
    if (best!.makespan <= lowerBound) break;
  }
  return best!;
}

function branchAndBound(
  graph: Graph,
  order: readonly number[],
  tails: readonly number[],
  byOwnerAndTail: readonly number[][],
  incumbent: Candidate,
  rootBound: number,
  stopAt: number,
  nodeLimit: number,
): Candidate & { complete: boolean; nodes: number } {
  const { n, duration, machine, preds, succs } = graph;
  const start = new Array<number>(n).fill(-1);
  const avail = new Array<number>(graph.owners.length).fill(0);
  const waiting = preds.map((list) => list.length);
  const head = new Array<number>(n).fill(0);
  const unownedInOrder = order.filter((i) => machine[i] === -1);
  const scratch: number[] = [];
  const isOpen = (task: number) => start[task]! < 0;

  let best = incumbent.makespan;
  let bestStart = incumbent.start;
  let placed = 0;
  let currentMax = 0;
  let nodes = 0;
  let stopped = false;
  let solved = false;
  const logTask: number[] = [];
  const logMax: number[] = [];

  const place = (i: number, s: number) => {
    logTask.push(i);
    logMax.push(currentMax);
    start[i] = s;
    placed++;
    currentMax = Math.max(currentMax, s + duration[i]!);
    for (const x of succs[i]!) waiting[x]!--;
  };
  const undoTo = (mark: number) => {
    while (logTask.length > mark) {
      const i = logTask.pop()!;
      currentMax = logMax.pop()!;
      start[i] = -1;
      placed--;
      for (const x of succs[i]!) waiting[x]!++;
    }
  };
  const readyAt = (i: number) => {
    let s = machine[i]! >= 0 ? avail[machine[i]!]! : 0;
    for (const p of preds[i]!) s = Math.max(s, start[p]! + duration[p]!);
    return s;
  };
  const placeUnownedTasks = () => {
    for (const i of unownedInOrder) if (start[i]! < 0 && waiting[i] === 0) place(i, readyAt(i));
  };
  const nodeBound = () => {
    let bound = currentMax;
    for (const v of order) {
      if (start[v]! >= 0) continue;
      let h = machine[v]! >= 0 ? avail[machine[v]!]! : 0;
      for (const p of preds[v]!) {
        const end = start[p]! >= 0 ? start[p]! + duration[p]! : head[p]! + duration[p]!;
        if (end > h) h = end;
      }
      head[v] = h;
      bound = Math.max(bound, h + duration[v]! + tails[v]!);
    }
    return Math.max(bound, ownerBoundValue(graph, head, tails, byOwnerAndTail, isOpen, scratch));
  };

  const search = () => {
    nodes++;
    if ((nodes & 127) === 0 && (now() > stopAt || nodes > nodeLimit)) stopped = true;
    if (stopped || solved) return;
    const mark = logTask.length;
    placeUnownedTasks();
    if (placed === n) {
      if (currentMax < best) {
        best = currentMax;
        bestStart = [...start];
        if (best <= rootBound) solved = true;
      }
      undoTo(mark);
      return;
    }
    if (nodeBound() >= best) {
      undoTo(mark);
      return;
    }

    // Giffler-Thompson branching: the task that could finish first, and every
    // task of the same owner that could start before that.
    let firstEnd = Infinity;
    let firstStart = Infinity;
    let first = -1;
    const open: number[] = [];
    const openStart: number[] = [];
    for (let i = 0; i < n; i++) {
      if (start[i]! >= 0 || machine[i]! < 0 || waiting[i] !== 0) continue;
      const s = readyAt(i);
      open.push(i);
      openStart.push(s);
      const e = s + duration[i]!;
      if (e < firstEnd || (e === firstEnd && s < firstStart)) {
        firstEnd = e;
        firstStart = s;
        first = i;
      }
    }
    const owner = machine[first]!;
    const branches = open
      .map((task, k) => ({ task, s: openStart[k]! }))
      .filter(({ task, s }) => machine[task] === owner && s < firstEnd)
      .sort(
        (a, b) =>
          tails[b.task]! + duration[b.task]! - (tails[a.task]! + duration[a.task]!) ||
          a.s - b.s ||
          a.task - b.task,
      );

    const previousAvail = avail[owner]!;
    for (const { task, s } of branches) {
      const inner = logTask.length;
      place(task, s);
      avail[owner] = s + duration[task]!;
      search();
      undoTo(inner);
      avail[owner] = previousAvail;
      if (stopped || solved) break;
    }
    undoTo(mark);
  };

  search();
  return { start: bestStart, makespan: best, complete: !stopped, nodes };
}

export function solve(graph: Graph, limits: SolveLimits): Solution {
  const startedAt = now();
  if (graph.n === 0) {
    return {
      start: [],
      makespan: 0,
      lowerBound: 0,
      chain: { value: 0, chain: [] },
      owner: null,
      optimal: true,
      method: "bound_met_by_heuristic",
      nodes: 0,
    };
  }

  const order = topologicalOrder(graph);
  const heads = computeHeads(graph, order);
  const tails = computeTails(graph, order);
  const byOwnerAndTail = tasksByOwnerAndTail(graph, tails);
  const chain = chainBound(graph, heads, tails);
  const owner = ownerBound(graph, heads, tails, byOwnerAndTail);
  const lowerBound = Math.max(chain.value, owner?.value ?? 0);
  const base = { lowerBound, chain, owner };

  const heuristic = runHeuristics(
    graph,
    heads,
    tails,
    lowerBound,
    startedAt + limits.timeLimitMs * 0.25,
  );
  if (heuristic.makespan <= lowerBound) {
    return { ...base, ...heuristic, optimal: true, method: "bound_met_by_heuristic", nodes: 0 };
  }

  const searched = branchAndBound(
    graph,
    order,
    tails,
    byOwnerAndTail,
    heuristic,
    lowerBound,
    startedAt + limits.timeLimitMs,
    limits.nodeLimit,
  );
  const optimal = searched.complete || searched.makespan <= lowerBound;
  return {
    ...base,
    start: searched.start,
    makespan: searched.makespan,
    optimal,
    method: optimal ? "branch_and_bound" : "best_found_within_limit",
    nodes: searched.nodes,
  };
}
