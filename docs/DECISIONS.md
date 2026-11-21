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

`deepseek/deepseek-v4.1-flash-1017` costs $0.15 / $0.60 per million tokens, supports strict structured outputs on OpenRouter, and is pinned to a dated snapshot so the graders run the model we tested, not whatever the alias points to next month. `REVIEW_MODEL` switches models; `npm run eval` scores any list of models on the facts established by hand (docs/INVESTIGATION.md), so the choice rests on evidence.

Evidence, 20 Nov 2026, three sample plans per run, 51 facts per run:

| Model                      | Setting                                 | Facts right                                                            | Calls per review | Time per review                                             |
| -------------------------- | --------------------------------------- | ---------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------- |
| DeepSeek V4.1 Flash        | final (reasoning off, statements first) | 100% in 5 of 5 runs                                                    | 1                | 3 to 19 s                                                   |
| DeepSeek V4.1 Flash        | reasoning on (provider default)         | 100% when it answered                                                  | up to 3          | up to 150 s; 3 of 6 calls ran out of tokens while reasoning |
| DeepSeek V4.1 Flash        | reasoning off, before statements first  | missed the Harbour Run circle in 3 of 6 runs                           | 1                | 4 to 14 s                                                   |
| Nemotron 3.5 Super (free)  | final                                   | 92% (missed a task stated only in the notes)                           | 1                | 7 to 18 s                                                   |
| MiniMax M3.1 Flash         | reasoning on                            | 98% (missed the circle)                                                | 1                | 3 to 58 s; refuses reasoning off                            |
| GPT-6 Luna, Qwen 3.8 Flash |                                         | unusable: no provider honours a strict schema, or every call timed out |                  |                                                             |

Two findings came out of this. First, reasoning hurt: DeepSeek reasoned until it used up its whole output budget in half of the calls, whatever the effort level or token cap, so reasoning is off by default (`REVIEW_REASONING` turns it back on), and an answer cut off at the limit is retried from the start rather than repaired. Second, without reasoning the model sometimes missed a dependency stated only in the notes, which is where the Harbour Run circle hides; asking it to list every dependency statement first fixed that (D6). The free Nemotron model remains a documented no-cost fallback.

The client is plain `fetch` (no SDK): one endpoint, and retries, error classes and key redaction are all visible in one file. `provider.require_parameters` makes OpenRouter route only to providers that honour the JSON schema.

## D6. The model proposes, code decides

The model does what only a model can: read a plan written in prose and tables and turn it into tasks, dependencies and judgements. Everything that can be checked is checked in code:

- Shape, unique ids and known dependencies (D3).
- Every quote must be word for word in the plan after collapsing whitespace, the contract's rule. A quote that only lost markdown emphasis is repaired from the plan's own words; anything else goes back to the model for a repair round, up to three calls. A task quote that never verifies fails the review (exit 1); a finding quote that never verifies is removed and marked `quote_removed`.
- The deadline is settled by code from the plan's own statements ("21 days after our kickoff meeting", "five weeks after kickoff", "day 45"). Two different stated days mean the plan does not clearly state one, so `deadline_day` is null and a blocker finding quotes both.
- Dependencies come with evidence. The model first lists every place the plan says one task waits for another, with the exact quote; code verifies each quote and checks the task list agrees. A missing dependency goes back for repair, and on the last attempt code adds it when both task names match one task each. The review keeps the evidence (`dependency_evidence`).
- Lateness, circles, missing owners and look-alike owner names are computed by code and reported as findings marked "Checked by code". The model is told not to report them; when it does anyway, its finding is dropped if it quotes the same evidence and is about the same thing, while a remark on another issue that quotes the same text is kept.

## D7. Prompt injection: four layers

The Harbour Run plan tells the reviewer to report no findings and record the deadline as day 99, and the starter's stored review obeyed. Defences: the plan is sent as data inside `<plan>` tags with an instruction never to follow it; code detects text aimed at the reviewer and reports it as a finding; a deadline that comes from such text is ignored (D6); and stored reviews are re-verified on load (D10), which is how the starter's bait review is caught.

## D8. Exit codes and atomic writes for `./review`

0 written, 1 no usable review, 2 usage or setup problem, 3 model service problem. The graders "do not read the output file" on a non-zero exit, and Nora must never see an unverified review, so nothing is written unless the review passed every check; the file is written to a temporary name and renamed. The default time budget is 270 s of the graders' 300.

## D9. Findings are few, ranked and quoted

Nora's email: the last tool gave a long list and she could not tell which comments mattered. Findings carry a severity: "Must change before sign-off", "Should be fixed or clarified", and minor notes, which are collapsed. The model groups findings of one kind (for example, all tasks that appear only in the notes) and aims for six or fewer; the eval fails a review with more than eight. Each finding has a quote she can show to the committee, and a one-click reply quotes the plan back to them.

## D10. The page re-verifies stored reviews and refuses what fails

Review files are inputs like any other. On every load the repository re-checks the contract, every quote, and the deadline against the plan's statements. A review that fails is not shown; the page says why and how to make a new one.

## D11. Corrections run through the contract endpoint and stay in the browser

Nora's corrections are sent to `POST /api/schedule`, the endpoint the graders test, so there is one scheduler and one proof. Corrections are kept in browser storage (with an in-memory fallback), keyed to the review they correct, and discarded when it is regenerated. This needs no server writes, no accounts and no database, which the deployment does not need for one officer. Given up: sharing corrections between devices.

## D12. No live model calls from the public page

Reviews are made offline with `./review` and stored. A public page that calls a paid model on demand invites cost abuse and needs rate limiting and accounts, and every result would need the same verification anyway. The page's AI is the verified review; the corrections loop is deterministic and instant.

## D13. Readable and plain beats quiet and on-brand

The person using this is not technical, so the page must be clear at a glance. Brand colours, fonts and voice stay; where BRAND.md's quiet defaults hurt readability, readability wins:

- Text is larger: 16 px body, 18 px for verdicts and finding titles, instead of the brand's 11 to 13 px.
- Text is darker: secondary text is `#4F4740` (9.4:1 on white) rather than the brand's 70% muted labels (3.4:1), and small terracotta text is `#B04A2E` (4.9:1 on its tint). The brand terracotta stays for borders, lines and large headings.
- Controls look like controls: the main action is a solid deep-green button with white text, other actions are outlined, all at least 44 px tall, and inputs have borders of 3.6:1.
- Status never relies on colour alone: every status has words and an icon ("Will finish 7 days late", "On time, with 3 days to spare", "Can't be scheduled").
- Wording is plain: "What needs fixing", "See this in the plan", "Change tasks", "Undo all changes", "Days are counted from the committee's kickoff meeting". No model names or technical terms on screen.

axe checks every page against WCAG 2.1 A and AA in CI, on desktop and phone sizes.

## D14. Lenient content type, strict body

`POST /api/schedule` accepts any content type if the body is JSON (fetch with a string body sends text/plain; curl -d sends form-urlencoded). The body itself is capped at 256 KB and validated strictly, with 400, 413 and 422 refusals in JSON.

## D15. Standalone build in a locked-down container

The Docker image runs Next.js's standalone server as the `node` user on a digest-pinned base image, works with a read-only file system and no Linux capabilities, and has a health check. CI runs it that way and points the graders' checker at it.

## D17. The deployed page is behind a password; the contract API is not

The deployed page and the plan data need a password (nginx basic auth, over HTTPS; the password is shared outside the repository). `POST /api/schedule` and `GET /api/health` stay open, because the graders' `check_contract.py` posts to the endpoint without a password. The open endpoint only schedules what it is sent, is rate-limited per client (50 a second, bursts of 200: far above a test script, enough to stop a flood) and runs in a container capped at 2 CPUs.

## D18. Deployed on a shared server behind nginx

The image runs on an existing server next to other apps: bound to `127.0.0.1:8100`, read-only, without capabilities, capped at 2 CPUs and 1 GB, restarted unless stopped. nginx adds HTTPS (Let's Encrypt, renewed automatically), the password and the rate limit. The name `planreviewer.213-133-98-90.sslip.io` resolves to the server without a DNS record. `deploy/deploy.sh` ships committed code into a fresh release folder and waits for the health check (docs/DEPLOY.md).

## D16. What we cut

- Uploading new plans from the page and reviewing them live (D12).
- Server-side storage of corrections, accounts and sharing (D11).
- Calendar dates: plans count days from kickoff, as all three samples do.
- Partial availability (someone working half days) and tasks that can be split between people: the contract has neither.
