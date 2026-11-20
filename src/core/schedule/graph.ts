// The task graph in index form, and the precedence facts every other part of
// the scheduler builds on. Everything here is iterative, so a long chain of
// tasks cannot overflow the call stack.

import type { Task } from "../contracts";

export type Graph = {
  n: number;
  ids: string[];
  duration: number[];
  /** Owner index per task, or -1 when the task has no owner (no person limit). */
  machine: number[];
  /** Owner names by owner index. */
  owners: string[];
  /** preds[i]: tasks that task i depends on. */
  preds: number[][];
  /** succs[i]: tasks that depend on task i. */
  succs: number[][];
};

export function buildGraph(tasks: readonly Task[]): Graph {
  const index = new Map<string, number>();
  tasks.forEach((task, i) => index.set(task.id, i));

  const ownerIndex = new Map<string, number>();
  const owners: string[] = [];
  const machine = tasks.map((task) => {
    if (task.owner === null) return -1;
    let k = ownerIndex.get(task.owner);
    if (k === undefined) {
      k = owners.length;
      owners.push(task.owner);
      ownerIndex.set(task.owner, k);
    }
    return k;
  });

  const preds = tasks.map((task) => {
    const unique = new Set<number>();
    for (const dependency of task.depends_on) {
      const j = index.get(dependency);
      if (j === undefined)
        throw new Error(`task "${task.id}" depends on unknown id "${dependency}"`);
      unique.add(j);
    }
    return [...unique];
  });
  const succs: number[][] = tasks.map(() => []);
  preds.forEach((list, i) => list.forEach((j) => succs[j]!.push(i)));

  return {
    n: tasks.length,
    ids: tasks.map((task) => task.id),
    duration: tasks.map((task) => task.duration_days),
    machine,
    owners,
    preds,
    succs,
  };
}

/** Tarjan's strongly connected components, iterative, over "depends on" edges. */
function stronglyConnectedComponents(graph: Graph): number[][] {
  const { n, preds } = graph;
  const order = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  const components: number[][] = [];
  let counter = 0;

  for (let root = 0; root < n; root++) {
    if (order[root] !== -1) continue;
    const work: [node: number, edge: number][] = [[root, 0]];
    order[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = true;
    while (work.length) {
      const frame = work[work.length - 1]!;
      const v = frame[0];
      const edges = preds[v]!;
      if (frame[1] < edges.length) {
        const w = edges[frame[1]++]!;
        if (order[w] === -1) {
          order[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = true;
          work.push([w, 0]);
        } else if (onStack[w]) {
          low[v] = Math.min(low[v]!, order[w]!);
        }
      } else {
        work.pop();
        const parent = work[work.length - 1];
        if (parent) low[parent[0]] = Math.min(low[parent[0]]!, low[v]!);
        if (low[v] === order[v]) {
          const component: number[] = [];
          let w: number;
          do {
            w = stack.pop()!;
            onStack[w] = false;
            component.push(w);
          } while (w !== v);
          components.push(component);
        }
      }
    }
  }
  return components;
}

/** Every group of tasks that wait on each other in a circle, smallest index first. */
export function cyclicGroups(graph: Graph): number[][] {
  return stronglyConnectedComponents(graph)
    .filter((group) => group.length > 1 || graph.preds[group[0]!]!.includes(group[0]!))
    .map((group) => [...group].sort((a, b) => a - b))
    .sort((a, b) => a[0]! - b[0]!);
}

/**
 * The shortest circle through the group's first task, ordered so each task
 * depends on the next one and the last depends on the first.
 */
export function findCycle(graph: Graph, group: readonly number[]): number[] {
  const start = group[0]!;
  if (graph.preds[start]!.includes(start)) return [start];
  const inGroup = new Set(group);
  const parent = new Map<number, number>();
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head]!;
    for (const w of graph.preds[v]!) {
      if (!inGroup.has(w)) continue;
      if (w === start) {
        const path = [v];
        while (path[path.length - 1] !== start) path.push(parent.get(path[path.length - 1]!)!);
        return path.reverse();
      }
      if (!parent.has(w) && w !== start) {
        parent.set(w, v);
        queue.push(w);
      }
    }
  }
  throw new Error("group has no cycle through its first task");
}

/** Dependencies before dependants; ties keep request order. Assumes no cycles. */
export function topologicalOrder(graph: Graph): number[] {
  const remaining = graph.preds.map((list) => list.length);
  const ready: number[] = [];
  for (let i = 0; i < graph.n; i++) if (remaining[i] === 0) ready.push(i);
  const order: number[] = [];
  for (let head = 0; head < ready.length; head++) {
    const v = ready[head]!;
    order.push(v);
    for (const s of graph.succs[v]!) if (--remaining[s]! === 0) ready.push(s);
  }
  if (order.length !== graph.n) throw new Error("graph has a cycle");
  return order;
}

/** heads[i]: the earliest day task i can start if nobody were ever busy. */
export function computeHeads(graph: Graph, order: readonly number[]): number[] {
  const heads = new Array<number>(graph.n).fill(0);
  for (const v of order) {
    for (const p of graph.preds[v]!) heads[v] = Math.max(heads[v]!, heads[p]! + graph.duration[p]!);
  }
  return heads;
}

/** tails[i]: the least work that must still follow once task i ends. */
export function computeTails(graph: Graph, order: readonly number[]): number[] {
  const tails = new Array<number>(graph.n).fill(0);
  for (let k = order.length - 1; k >= 0; k--) {
    const v = order[k]!;
    for (const s of graph.succs[v]!) tails[v] = Math.max(tails[v]!, graph.duration[s]! + tails[s]!);
  }
  return tails;
}
