// Benchmarks the scheduler on random plans of up to 60 tasks and reports how
// often it proves its answer optimal, the gap to the lower bound when it
// cannot, and how long it takes. Results feed docs/SCHEDULER.md.
//
//   npx tsx scripts/bench-scheduler.ts [count] [timeLimitMs]

import type { Task } from "../src/core/contracts";
import { scheduleTasks } from "../src/core/schedule/schedule";

const count = Number(process.argv[2] ?? 300);
const timeLimitMs = Number(process.argv[3] ?? 2000);

let seed = 12345;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;

type Row = {
  tasks: number;
  owners: number;
  optimal: boolean;
  gap: number;
  ms: number;
  method: string;
};
const rows: Row[] = [];

for (let run = 0; run < count; run++) {
  const n = 10 + Math.floor(random() * 51);
  const ownerCount = 1 + Math.floor(random() * 6);
  const owners = [...Array.from({ length: ownerCount }, (_, i) => `P${i}`), null];
  const density = 0.02 + random() * 0.15;
  const tasks: Task[] = Array.from({ length: n }, (_, i) => ({
    id: `T${i}`,
    name: `Task ${i}`,
    owner: random() < 0.1 ? null : pick(owners),
    duration_days: 1 + Math.floor(random() * 14),
    depends_on: Array.from({ length: i }, (_, j) => j)
      .filter(() => random() < density)
      .map((j) => `T${j}`),
  }));
  const started = performance.now();
  const result = scheduleTasks({ tasks, deadline_day: 60 }, { timeLimitMs });
  const ms = performance.now() - started;
  if (result.status !== "scheduled") throw new Error("unexpected cycle");
  rows.push({
    tasks: n,
    owners: ownerCount,
    optimal: result.proof.optimal,
    gap: result.end_day - result.proof.lower_bound,
    ms,
    method: result.proof.solver.method,
  });
}

const percent = (part: number) => `${((100 * part) / rows.length).toFixed(1)}%`;
const proven = rows.filter((row) => row.optimal).length;
const unproven = rows.filter((row) => !row.optimal);
const times = rows.map((row) => row.ms).sort((a, b) => a - b);
const quantile = (q: number) =>
  times[Math.min(times.length - 1, Math.floor(q * times.length))]!.toFixed(0);
const methods = Object.entries(
  rows.reduce<Record<string, number>>(
    (acc, row) => ({ ...acc, [row.method]: (acc[row.method] ?? 0) + 1 }),
    {},
  ),
);

console.log(`plans: ${rows.length} (10-60 tasks, 1-6 owners, time limit ${timeLimitMs} ms)`);
console.log(`proven optimal: ${proven} (${percent(proven)})`);
console.log(`methods: ${methods.map(([m, c]) => `${m} ${c}`).join(", ")}`);
if (unproven.length) {
  const gaps = unproven.map((row) => row.gap);
  console.log(
    `not proven: ${unproven.length}; gap to lower bound in days: median ${gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]}, max ${Math.max(...gaps)}`,
  );
}
console.log(
  `time per plan (ms): median ${quantile(0.5)}, p95 ${quantile(0.95)}, max ${quantile(1)}`,
);
