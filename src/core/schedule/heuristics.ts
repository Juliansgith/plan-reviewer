// Fast schedules that are usually optimal: list scheduling under several
// priority rules and seeded random variants, each improved by
// forward-backward passes (pack right, then pack left). solve.ts stops here
// when one of them meets the lower bound.

import type { Graph } from "./graph";
export type Candidate = { start: number[]; makespan: number };

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

export function runHeuristics(
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
