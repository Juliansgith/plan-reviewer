# Decisions

Each entry: what we decided, why, and what we gave up. All dated 20 Nov 2026 unless stated. A change to one of these should update its entry.

## D1. One TypeScript codebase: Next.js for page and API, Node for `./review`

The brief allows any stack as long as the two contracts hold. One language for the scheduler, the review pipeline, the API and the page means one set of types from one schema (D3), one test runner, and logic that runs wherever it is needed (the same core is used by `./review`, the API and the page). Next.js serves the page and the API from one process, which keeps deployment to one container.

Given up: Python's OR-Tools CP-SAT solver, which would have been the easy choice for scheduling. D4 covers how we do without it.

## D2. Pinned versions, with two deliberate holds

Every dependency is pinned exactly and installed with `npm ci`. TypeScript stays on 6.0 because typescript-eslint does not yet support 7; ESLint stays on 9 because eslint-plugin-react and eslint-plugin-import do not yet support 10. Dependabot proposes updates weekly. npm 11 blocks install scripts by default; nothing here needs one, so none is approved.

## D3. zod schemas are the single source of truth for both contracts

`src/core/contracts.ts` defines the request, the response's inputs and the review as zod schemas; types are inferred from them. The API, `./review` and the plan repository all validate with the same schemas, and error messages name the task ("task "A" depends on unknown id "Z""). Objects are loose because the contract allows extra fields; the starter's TypeScript types had already drifted from the contract, which this rules out.

## D4. Scheduler: exact search with lower bounds, written in TypeScript

The problem (one person, one task at a time; tasks wait for dependencies; minimise the end day) is NP-hard. With at most 60 tasks we can be exact almost always and honest when not:

- Two lower bounds with human reasons: the longest dependency chain, and per owner the one-machine bound (earliest start + total work + least remaining work after).
- Heuristics (four priority rules and seeded random variants, each improved by forward-backward passes) usually meet the bound at once.
- Otherwise a branch and bound over active schedules (Giffler and Thompson), pruned by the bounds, under a 3 s / 5 million node limit.

Every answer carries a proof: the lower bound, its reason, and whether the end day is proven optimal. On 300 random plans of 10 to 60 tasks, 298 were proven optimal, median time under 1 ms (docs/SCHEDULER.md). Alternatives considered: a MILP solver compiled to WebAssembly (HiGHS) with big-M disjunctions, which is weak on this structure and adds a large dependency; and heuristics alone, which cannot say why the answer is right, and the brief asks for that.

## D5. Model: DeepSeek V4.1 Flash, pinned snapshot, via OpenRouter

`deepseek/deepseek-v4.1-flash-1017` costs $0.15 / $0.60 per million tokens, supports strict structured outputs on OpenRouter, and is pinned to a dated snapshot so the graders run the model we tested, not whatever the alias points to next month. A review costs a fraction of a cent. `REVIEW_MODEL` switches models; `npm run eval` compares them on facts established by hand (docs/INVESTIGATION.md), so the choice can be revisited with evidence. The free `nvidia/nemotron-3.5-super-vl:free` also supports structured outputs and works as a no-cost fallback.

The client is plain `fetch` (no SDK): one endpoint, and retries, error classes and key redaction are all visible in one file. `provider.require_parameters` makes OpenRouter route only to providers that honour the JSON schema.

## D6. The model proposes, code decides

The model does what only a model can: read a plan written in prose and tables and turn it into tasks, dependencies and judgements. Everything that can be checked is checked in code:

- Shape, unique ids and known dependencies (D3).
- Every quote must be word for word in the plan after collapsing whitespace, the contract's rule. A quote that only lost markdown emphasis is repaired from the plan's own words; anything else goes back to the model for a repair round, up to three calls. A task quote that never verifies fails the review (exit 1); a finding quote that never verifies is removed and marked `quote_removed`.
- The deadline is settled by code from the plan's own statements ("21 days after our kickoff meeting", "five weeks after kickoff", "day 45"). Two different stated days mean the plan does not clearly state one, so `deadline_day` is null and a blocker finding quotes both.
- Lateness, circles, missing owners and look-alike owner names are computed by code and reported as findings marked "Checked by code"; the model is told not to report them, so they are not duplicated.

## D7. Prompt injection: four layers

The Harbour Run plan tells the reviewer to report no findings and record the deadline as day 99, and the starter's stored review obeyed. Defences: the plan is sent as data inside `<plan>` tags with an instruction never to follow it; code detects text aimed at the reviewer and reports it as a finding; a deadline that comes from such text is ignored (D6); and stored reviews are re-verified on load (D10), which is how the starter's bait review is caught.

## D8. Exit codes and atomic writes for `./review`

0 written, 1 no usable review, 2 usage or setup problem, 3 model service problem. The graders "do not read the output file" on a non-zero exit, and Nora must never see an unverified review, so nothing is written unless the review passed every check; the file is written to a temporary name and renamed. The default time budget is 270 s of the graders' 300.

## D9. Findings are few, ranked and quoted

Nora's email: the last tool gave a long list and she could not tell which comments mattered. Findings carry a severity: "Must change before sign-off", "Should be fixed or clarified", and minor notes, which are collapsed. Each has a quote she can show to the committee, and a one-click reply quotes the plan back to them.

## D10. The page re-verifies stored reviews and refuses what fails

Review files are inputs like any other. On every load the repository re-checks the contract, every quote, and the deadline against the plan's statements. A review that fails is not shown; the page says why and how to make a new one.

## D11. Corrections run through the contract endpoint and stay in the browser

Nora's corrections are sent to `POST /api/schedule`, the endpoint the graders test, so there is one scheduler and one proof. Corrections are kept in browser storage (with an in-memory fallback), keyed to the review they correct, and discarded when it is regenerated. This needs no server writes, no accounts and no database, which the deployment does not need for one officer. Given up: sharing corrections between devices.

## D12. No live model calls from the public page

Reviews are made offline with `./review` and stored. A public page that calls a paid model on demand invites cost abuse and needs rate limiting and accounts, and every result would need the same verification anyway. The page's AI is the verified review; the corrections loop is deterministic and instant.

## D13. Accessibility wins over exact brand values, by the smallest margin

axe found that BRAND.md's 70% muted labels (3.4:1) and terracotta small text (3.8:1 on its tint) fail WCAG AA. Labels use muted text at full strength (6.9:1); small terracotta text uses `#B04A2E` (4.9:1). The brand terracotta remains for borders, lines and the large headline, where 3:1 suffices. Every page is scanned in CI.

## D14. Lenient content type, strict body

`POST /api/schedule` accepts any content type if the body is JSON (fetch with a string body sends text/plain; curl -d sends form-urlencoded). The body itself is capped at 256 KB and validated strictly, with 400, 413 and 422 refusals in JSON.

## D15. Standalone build in a locked-down container

The Docker image runs Next.js's standalone server as the `node` user on a digest-pinned base image, works with a read-only file system and no Linux capabilities, and has a health check. CI runs it that way and points the graders' checker at it.

## D16. What we cut

- Uploading new plans from the page and reviewing them live (D12).
- Server-side storage of corrections, accounts and sharing (D11).
- Calendar dates: plans count days from kickoff, as all three samples do.
- Partial availability (someone working half days) and tasks that can be split between people: the contract has neither.
