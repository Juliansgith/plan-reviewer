// Lower bounds: proofs that no valid schedule can end before a given day.
//
// 1. Dependency chain. A task cannot start before its dependencies end, and
//    the work that depends on it cannot start before it ends, so for every
//    task i:  end_day >= head(i) + duration(i) + tail(i).
//
// 2. Owner workload. One person does one task at a time. Take any set S of one
//    owner's tasks. None of them can start before min head over S, together
//    they take sum duration over S, and after the last one ends at least
//    min tail over S of dependent work remains. So
//        end_day >= min head(S) + sum duration(S) + min tail(S).
//    This is the classic one-machine bound; maximising it over sets of the
//    form {j : head(j) >= a, tail(j) >= b} gives the optimum of the
//    preemptive one-machine relaxation, and needs only O(k^2) per owner.

import type { Graph } from "./graph";

export type ChainBound = { value: number; chain: number[] };

export type OwnerBound = {
  value: number;
  machine: number;
  members: number[];
  earliestStart: number;
  work: number;
  tail: number;
};

export function chainBound(
  graph: Graph,
  heads: readonly number[],
  tails: readonly number[],
): ChainBound {
  let best = -1;
  let value = 0;
  for (let i = 0; i < graph.n; i++) {
    const length = heads[i]! + graph.duration[i]! + tails[i]!;
    if (length > value) {
      value = length;
      best = i;
    }
  }
  if (best < 0) return { value: 0, chain: [] };

  const chain = [best];
  let current = best;
  while (graph.preds[current]!.length) {
    const previous = graph.preds[current]!.find(
      (p) => heads[p]! + graph.duration[p]! === heads[current],
    );
    if (previous === undefined) break;
    chain.unshift(previous);
    current = previous;
  }
  current = best;
  while (graph.succs[current]!.length) {
    const next = graph.succs[current]!.find(
      (s) => graph.duration[s]! + tails[s]! === tails[current],
    );
    if (next === undefined) break;
    chain.push(next);
    current = next;
  }
  return { value, chain };
}

/** Each owner's tasks sorted by tail, largest first; the order the bound scans in. */
export function tasksByOwnerAndTail(graph: Graph, tails: readonly number[]): number[][] {
  const byOwner: number[][] = graph.owners.map(() => []);
  for (let i = 0; i < graph.n; i++) {
    const k = graph.machine[i]!;
    if (k >= 0) byOwner[k]!.push(i);
  }
  for (const list of byOwner) list.sort((a, b) => tails[b]! - tails[a]! || a - b);
  return byOwner;
}

/**
 * The best owner bound over the given tasks. `include` lets the search reuse
 * this at every node for the tasks not yet placed, with updated heads.
 */
export function ownerBound(
  graph: Graph,
  heads: ArrayLike<number>,
  tails: readonly number[],
  byOwnerAndTail: readonly number[][],
  include: (task: number) => boolean = () => true,
): OwnerBound | null {
  let best: {
    value: number;
    machine: number;
    threshold: number;
    position: number;
    size: number;
  } | null = null;
  const members: number[] = [];

  byOwnerAndTail.forEach((sorted, machine) => {
    members.length = 0;
    for (const task of sorted) if (include(task)) members.push(task);
    if (members.length === 0) return;
    const thresholds = [...new Set(members.map((task) => heads[task]!))];
    for (const threshold of thresholds) {
      let work = 0;
      let size = 0;
      for (let position = 0; position < members.length; position++) {
        const task = members[position]!;
        if (heads[task]! < threshold) continue;
        work += graph.duration[task]!;
        size++;
        const value = threshold + work + tails[task]!;
        // On equal values keep the larger set: it explains more of the work.
        if (!best || value > best.value || (value === best.value && size > best.size)) {
          best = { value, machine, threshold, position, size };
        }
      }
    }
  });

  if (!best) return null;
  const { machine, threshold, position } = best as {
    machine: number;
    threshold: number;
    position: number;
  };
  const sorted = byOwnerAndTail[machine]!.filter(include);
  const chosen = sorted.slice(0, position + 1).filter((task) => heads[task]! >= threshold);
  const earliestStart = Math.min(...chosen.map((task) => heads[task]!));
  const work = chosen.reduce((sum, task) => sum + graph.duration[task]!, 0);
  const tail = Math.min(...chosen.map((task) => tails[task]!));
  return {
    value: earliestStart + work + tail,
    machine,
    members: [...chosen].sort((a, b) => a - b),
    earliestStart,
    work,
    tail,
  };
}

/** The owner bound's value only, without building an explanation. Used at every search node. */
export function ownerBoundValue(
  graph: Graph,
  heads: ArrayLike<number>,
  tails: readonly number[],
  byOwnerAndTail: readonly number[][],
  isOpen: (task: number) => boolean,
  scratch: number[],
): number {
  let best = 0;
  for (const sorted of byOwnerAndTail) {
    scratch.length = 0;
    for (const task of sorted) if (isOpen(task)) scratch.push(task);
    for (let a = 0; a < scratch.length; a++) {
      const threshold = heads[scratch[a]!]!;
      let work = 0;
      for (let position = 0; position < scratch.length; position++) {
        const task = scratch[position]!;
        if (heads[task]! < threshold) continue;
        work += graph.duration[task]!;
        const value = threshold + work + tails[task]!;
        if (value > best) best = value;
      }
    }
  }
  return best;
}
