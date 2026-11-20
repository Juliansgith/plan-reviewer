# How the scheduler finds and proves the earliest end day

Code: `src/core/schedule/`. Contract: docs/contracts.md, "Scheduling".

## The problem

Each task has a duration in whole days, a list of tasks it waits for, and at most one owner. A task starts when everything it waits for has ended; one owner does one task at a time; tasks without an owner have no person limit. Find start days that make the last task end as early as possible.

This contains job-shop scheduling, which is NP-hard, so no fast method is exact on every input. Plans have at most 60 tasks, which leaves room to be exact on almost all of them and to say so when we are not.

## Steps

1. **Cycle check** (`graph.ts`). Tarjan's strongly connected components, written without recursion. Any component with two or more tasks, or a task that waits for itself, is a circle. The answer names one circle in order (each task waits for the next) and lists every circular group in `cycle_groups`.
2. **Heads and tails.** For each task, its head is the earliest day it could start if nobody were ever busy, and its tail is the least work that must still follow it.
3. **Lower bounds** (`bounds.ts`), each with a reason a person can read:
   - _Dependency chain_: `end ≥ head(i) + duration(i) + tail(i)` for every task. The reason names the chain.
   - _Owner workload_: for a set S of one person's tasks, none can start before the smallest head in S, together they take the sum of their durations, and after the last of them the smallest tail in S remains. So `end ≥ min head(S) + Σ duration(S) + min tail(S)`. Maximising over sets of the form {head ≥ a, tail ≥ b} gives the optimum of the preemptive one-machine relaxation in O(k²) per owner. The reason reads, for example, "Ruth has 52 days of work and can only do one task at a time." On a tie with a chain, the person is named, because that is what Nora can change.
4. **Heuristics** (`heuristics.ts`). List scheduling (each task as early as its dependencies and its owner's free gaps allow) under four priority rules (longest remaining path, earliest head, remaining path plus owner load, most dependants) and 120 seeded random variants, each improved by forward-backward passes (pack right, then pack left). If one meets the lower bound, it is optimal and we stop.
5. **Exact search** (`solve.ts`). Branch and bound over _active_ schedules (Giffler and Thompson): take the unplaced task that could finish first, and branch only on the tasks of the same owner that could start before it ends. Every optimal plan has an active equivalent, so a search that finishes proves optimality. At every node the bounds above are recomputed on the remaining tasks with updated heads, and branches that cannot beat the best schedule so far are cut. Tasks without an owner are placed as soon as they can start and never branched on.
6. **Limits.** 3 seconds and 5 million nodes by default, well inside the 10 seconds the contract allows on a slow host. The node limit keeps answers identical across machines; the clock is a safety stop.
7. **Verification** (`verify.ts`). Every answer is checked by a line-by-line port of `check_contract.py` before it is returned. A failure would be a bug and raises an error instead of sending a wrong schedule.

## What the answer says

```json
"proof": {
  "lower_bound": 52,
  "bound": { "kind": "owner_workload", "owner": "Ruth", "task_ids": ["T1", "T2", "..."],
             "earliest_start": 0, "work_days": 52, "tail_days": 0 },
  "optimal": true,
  "solver": { "method": "bound_met_by_heuristic", "nodes": 0 }
},
"critical_path": ["T1", "T2", "..."]
```

`optimal: true` means no valid schedule ends sooner: either a schedule met the lower bound, or the exhaustive search finished. When the search hits its limit, `optimal` is false and `lower_bound` shows how far from proven the answer is. `critical_path` is the chain of tasks, each starting as the previous one ends, that sets the end day.

## Evidence

- **Property tests** (`schedule.property.test.ts`): on every run, 300 random plans of up to 25 tasks pass the contract verifier; 400 random plans of up to 7 tasks match an independent brute-force solver exactly and are proven optimal; 300 plans with an injected circle are all caught; random 60-task plans with up to 6 owners answer within the time limit.
- **Benchmark** (`npx tsx scripts/bench-scheduler.ts 300 2000`): 300 random plans of 10 to 60 tasks, 1 to 6 owners, densities up to about 17 dependencies per 100 task pairs. 298 proven optimal (237 by a heuristic meeting the bound, 61 by finished search); median time under 1 ms, 95th percentile 7 ms. The two unproven plans: one was later proven optimal with a 30 s budget (the 2 s answer was already the optimum; only the bound was weak), and one remained 6 days above its bound with 30 million nodes.
- **The starter's worst case**: 30 layers of 2 tasks, each waiting for both tasks of the layer before. The starter's recursion needed about half an hour; this answers in under a millisecond.

## Known limits

- The bound ignores interactions between owners, so on dense plans with two or three heavily loaded people it can be weaker than the true optimum, and the search may stop before proving it. The answer then says so.
- Search order and limits are tuned for plans of up to 60 tasks. The engine has no task limit of its own (the API enforces 60), and nothing in it recurses on chain length.
