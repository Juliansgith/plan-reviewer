# Notes

## Time spent

**[To fill in: hours of your own time.]** The work was done with an AI coding agent; see the last sections.

## What I did

I read the starter first and wrote down what it hides ([docs/INVESTIGATION.md](docs/INVESTIGATION.md)): the Harbour Run plan tells the reviewer to report no findings and a deadline of day 99, and the stored review obeyed; Harbour Run states two deadlines and contains a circle; Lantern Festival is at least 7 days late because Ruth holds 52 days of work, and has four tasks that appear only in the notes. Then I rebuilt it in one TypeScript codebase (Next.js page and API, Node `./review`), test-first; the history shows each test committed before its code.

- **AI.** The model proposes, code decides ([D6](docs/DECISIONS.md)). Every quote is checked word for word, errors go back for up to three repair rounds, and an unverifiable answer exits 1 and writes nothing. The model lists every "X waits for Y" statement with its quote before the tasks, and code reconciles the two. Code settles the deadline from the plan's own statements, ignores any deadline inside text aimed at the reviewer, and adds the findings it can establish for certain: circles, lateness and its cause, conflicting deadlines, missing owners, planted instructions. `npm run eval` scores models on 51 hand-checked facts: DeepSeek V4.1 Flash with reasoning off got all of them in 5 of 5 runs, one call per review, under 20 s and a fifth of a cent; with reasoning on it ran out of tokens in half its calls ([D5](docs/DECISIONS.md)).
- **Algorithm.** Lower bounds with a reason, heuristics, then an exact branch and bound with a 3 s limit. Every answer says whether it is proven optimal and why the end day cannot be beaten ("Ruth has 52 days of work and can only do one task at a time"). 298 of 300 random plans of up to 60 tasks were proven optimal, median under 1 ms ([docs/SCHEDULER.md](docs/SCHEDULER.md)).
- **Backend.** Both contracts are zod schemas shared by the API, `./review` and the page. Bad input gets 400, 413 or 422 with every problem listed in JSON. The graders' `check_contract.py` runs in CI against the built server and against the Docker image (non-root, read-only, digest-pinned).
- **UX.** Each plan opens on the verdict: late by how much, why, and how sure we are. Remarks are grouped by what must change before sign-off, each linked to its highlighted words in the plan. Nora can correct owners, durations, dependencies, tasks and the deadline and read what that changes; a reply quoting the plan copies in one click. BRAND.md throughout, checked at desktop and phone width and with axe (two contrast values darkened, [D13](docs/DECISIONS.md)).

## What I cut and why

Uploading and reviewing new plans from the page ([D12](docs/DECISIONS.md): a public page calling a paid model needs accounts and rate limits). Server-side storage of corrections ([D11](docs/DECISIONS.md): browser storage is enough for one officer and needs no database). Calendar dates, part-time availability and splitting tasks: no sample plan or contract field needs them.

## What is not ready

- The deadline and instruction detectors are deliberate heuristics; an unusual phrasing falls back to the model's reading, which is still verified.
- On rare dense plans the search stops before proving optimality; the answer then says `optimal: false` and shows the gap.
- Model quality is measured on the three sample plans only (`npm run eval`); unseen plans may phrase things the prompt does not anticipate.

## What I would do next and a rough estimate

1. A larger evaluation set: 20 plans with known answers, including new injection styles, run nightly against a cost budget. 1 day.
2. Stronger bounds (edge finding) to prove the hard dense cases. 1 day.
3. Upload and review new plans, with accounts, rate limits and a shared, audited record of corrections. 3 days.

## How I used AI tools

**[To review and make true in your own words.]** Claude Code wrote most of the code, tests and documents under my direction. I set the priorities, chose the stack and the model family, and reviewed the decisions in docs/DECISIONS.md. It worked test-first, and I checked its work by: property tests against an independent brute-force solver; the graders' checker against the built server and the Docker image; the review pipeline against hand-checked model answers, including one that obeys the injection; browser tests with accessibility scans; and using the page myself.

## Environment variables my review command needs

- `OPENROUTER_API_KEY` (required).
- `REVIEW_MODEL` (optional, default `deepseek/deepseek-v4.1-flash-1017`, chosen for low cost and strict structured outputs, pinned to a snapshot; [D5](docs/DECISIONS.md)).
- `REVIEW_TIMEOUT_SECONDS` (optional, default 270).
- `REVIEW_REASONING` (optional, default `off`; `low`, `medium` or `high`).

The deployed app is at https://planreviewer.213-133-98-90.sslip.io (password in the email; the scheduling API is open for your checker).
