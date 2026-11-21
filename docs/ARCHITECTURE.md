# Architecture

One TypeScript codebase serves the page and the API (Next.js) and runs the `./review` command (Node, via tsx). The logic that matters lives in a pure core that every entry point shares.

## Flow

```
 OFFLINE: ./review plan.md out.json                        ONLINE: the page and the API

 plan.md ──► prompt ──► OpenRouter ──► model answer
                          (proposes)        │
                                            ▼
            check.ts: shape, ids, every quote word for word, dependency statements
              │  problems? ──► repair round (up to 3 calls) ──► exit 1 if still unusable
              ▼
            assemble.ts: settle the deadline from the plan's own statements,
            add code findings (circle, lateness and its cause, conflicting
            deadlines, instructions to the reviewer, missing owners), drop
            duplicates, order by severity, re-check the contract
              │
              ▼
            data/reviews/<id>.json ─────────────► plans.ts: re-verify on load ──► page (server component)
                                                    (refuse what fails)              │
                                                         │                           ▼
                                                         ▼                    PlanWorkspace (client)
                                         scheduleTasks ◄── POST /api/schedule ◄── Nora's corrections
                                         (bounds, search,      (contract endpoint;      (browser storage)
                                          proof, verify)        graders call it too)
```

## Layers

| Folder           | What                                                                                                                                                                  | May import                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `src/core`       | Contracts (zod), scheduler, review pipeline, text matching. Pure: no file system, network or framework.                                                               | nothing outside `src/core`                    |
| `src/server`     | Node adapters: OpenRouter client, `./review` command, plan repository, API handlers (`Request` in, `Response` out)                                                    | `src/core`                                    |
| `src/ui`         | Page logic without React: verdict wording, correction diffs, what to do about each remark, timeline dragging, markdown with source offsets, reply text, storage store | `src/core`                                    |
| `src/components` | React components                                                                                                                                                      | `src/ui`, `src/core`, types from `src/server` |
| `src/app`        | Next.js pages and route handlers; a few lines each, wiring the layers above                                                                                           | everything                                    |
| `src/cli`        | Entry points for `./review` and `npm run eval`                                                                                                                        | `src/server`, `src/core`                      |

Tests sit next to the code they test (`*.test.ts` in Node, `*.test.tsx` in jsdom). Browser tests are in `e2e/`.

## The two contracts in code

`src/core/contracts.ts` defines both formats as zod schemas. The API validates requests with them, `./review` validates model answers with them, the plan repository validates stored reviews with them, and the TypeScript types the page uses are inferred from them. Objects are loose (unknown keys kept), because the contract allows extra fields.

Extra fields we add:

- Schedule answers: `proof` (`lower_bound`, `bound` with its reason, `optimal`, `solver`), `critical_path`, and for cycles `cycle_groups`.
- Reviews: per finding `severity` (blocker, warning, note), `source` (model or code), `kind`, and `quote_removed`; top level `deadline_quote`, `deadline_statements`, `meta` (model, attempts, tokens, cost, time).

## Trust boundaries

| Input               | Treated as               | Defence                                                                                                                         |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Plan text           | Untrusted data           | Sent inside `<plan>` tags as data; instructions in it are detected by code and reported; a deadline inside such text is ignored |
| Model answer        | Untrusted until verified | Schema, ids, dependencies and every quote checked against the plan; repair rounds; deadline settled by code                     |
| Stored review files | Untrusted                | Re-verified on every load; a review that fails is reported, not shown                                                           |
| API requests        | Untrusted                | Body capped at 256 KB, parsed with the contract schema, 4xx JSON refusals, solver time and node limits                          |
| Plan ids in URLs    | Untrusted                | Only ids found in `data/plans` are served (no path is ever built from the URL)                                                  |
| Browser storage     | Untrusted                | Parsed defensively; discarded when malformed or made for another review                                                         |
| API key             | Secret                   | Environment only, redacted from every error, never logged                                                                       |

## Failure modes

| What fails                                              | What happens                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| The model's answer cannot be verified after three calls | `./review` exits 1 with the problems and writes nothing                                                       |
| OpenRouter is down, rate limited or out of credit       | Retries with backoff, then exit 3 (exit 2 for a refused key)                                                  |
| A stored review fails verification                      | The page shows the plan, says the review is not shown and lists why                                           |
| The solver hits its time or node limit                  | Returns the best schedule found, `optimal: false`, and the lower bound, so the gap is visible                 |
| A schedule would break the contract                     | Impossible by construction, and checked: every answer passes the port of `check_contract.py` before it leaves |
| Browser storage is blocked                              | Corrections work for the visit from memory                                                                    |

## Testing map

| Layer                            | Tests                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts                        | Example files, every refusal rule, extra fields                                                                                                                               |
| Scheduler                        | Unit cases; property tests on thousands of random plans against the contract verifier and a brute-force solver; cycle injection; 60-task timing; `scripts/bench-scheduler.ts` |
| Review pipeline                  | Scripted model: good answers, repairs, refusals, injection, deadline settlement, code findings; quote location as a property test                                             |
| OpenRouter client and `./review` | Fake fetch for HTTP behaviour; the real CLI process against a stand-in server; `scripts/smoke-review.mjs` on Node 20                                                          |
| API and repository               | Handlers called with real `Request` objects; temporary data folders; the real sample data                                                                                     |
| Page logic and components        | Pure modules in Node; components in jsdom driven like a user                                                                                                                  |
| Whole app                        | Playwright on the production build, desktop and phone, with axe accessibility scans; `npm run contract` and the Docker job run the graders' checker against a real server     |
| Model quality                    | `npm run eval` against hand-established facts (real model, costs money, not in CI)                                                                                            |
