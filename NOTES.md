# Notes

## Time spent

About 20 to 25 minutes of my own direct attention. An AI coding agent (Claude Code) did the rest under my direction, in about 3 hours of working time; see "How I used AI tools".

## What I did

I read the starter first and wrote down what it hides ([docs/INVESTIGATION.md](docs/INVESTIGATION.md)): the Harbour Run plan tells the reviewer to report no findings and a deadline of day 99, and the stored review obeyed; Harbour Run states two deadlines and contains a circle; Lantern Festival is at least 7 days late because Ruth holds 52 days of work, and has four tasks that appear only in the notes. Then I rebuilt it in one TypeScript codebase (Next.js page and API, Node `./review`), test-first; the history shows each test committed before its code.

- **AI.** The model proposes, code decides ([D6](docs/DECISIONS.md)). Every quote is checked word for word, errors go back for up to three repair rounds, and an unverifiable answer exits 1 and writes nothing. The model lists every "X waits for Y" statement with its quote before the tasks, and code reconciles the two. Code settles the deadline from the plan's own statements, ignores any deadline inside text aimed at the reviewer, and adds the findings it can establish for certain: circles, lateness and its cause, conflicting deadlines, missing owners, planted instructions. `npm run eval` scores models on 51 hand-checked facts: DeepSeek V4.1 Flash with reasoning off got all of them in 5 of 5 runs, one call per review, under 20 s and a fifth of a cent; with reasoning on it ran out of tokens in half its calls ([D5](docs/DECISIONS.md)).
- **Algorithm.** Lower bounds with a reason, heuristics, then an exact branch and bound with a 3 s limit. Every answer says whether it is proven optimal and why the end day cannot be beaten ("Ruth has 52 days of work and can only do one task at a time"). 298 of 300 random plans of up to 60 tasks were proven optimal, median under 1 ms ([docs/SCHEDULER.md](docs/SCHEDULER.md)).
- **Backend.** Both contracts are zod schemas shared by the API, `./review` and the page. Bad input gets 400, 413 or 422 with every problem listed in JSON. The graders' `check_contract.py` runs in CI against the built server and against the Docker image (non-root, read-only, digest-pinned).
- **UX.** Built for someone who is not technical ([D13](docs/DECISIONS.md)): plain words, 16 px text, real contrast, every status in words as well as colour. Each plan opens on the verdict: late by how much, why, and how sure we are. Remarks are grouped by what must change before sign-off, each linked to its highlighted words in the plan, and each says what Nora can do about it: one click to try which task in a circle goes first or which stated deadline to use, or a jump to the field to change; a remark her changes sort out turns green ([D19](docs/DECISIONS.md)). She can drag a task to another person or stretch it in the timeline, or edit any task, and read what that changes; a reply quoting the plan copies in one click. Checked with axe at desktop and phone width.

## What I cut and why

Uploading and reviewing new plans from the page ([D12](docs/DECISIONS.md): a public page calling a paid model needs accounts and rate limits). Server-side storage of corrections ([D11](docs/DECISIONS.md): browser storage is enough for one officer and needs no database). Calendar dates, part-time availability and splitting tasks: no sample plan or contract field needs them.

## What is not ready

- The deadline, instruction and schedule-claim detectors are deliberate heuristics; an unusual phrasing falls back to the model's reading, which is still verified. A re-check on 22 Nov found and fixed two faults, test-first ([D6](docs/DECISIONS.md)): one task's date was read as a second deadline on an unseen plan, and the Spring Market review carried a model remark with wrong sums.
- On rare dense plans the search stops before proving optimality; the answer then says `optimal: false` and shows the gap.
- Model quality is measured on the three sample plans only (`npm run eval`); unseen plans may phrase things the prompt does not anticipate.

## What I would do next and a rough estimate

1. A larger evaluation set: 20 plans with known answers, including new injection styles, run nightly against a cost budget. 1 day.
2. Stronger bounds (edge finding) to prove the hard dense cases. 1 day.
3. Upload and review new plans, with accounts, rate limits and a shared, audited record of corrections. 3 days.

## How I used AI tools

Claude Code did the investigation, wrote the code, tests and documents, ran the model evaluation and deployed the app. My part was direction and judgement:

- I had it look for prompt injection and traps in the starter before anything else, and score the starter against my other projects.
- I chose the stack (Next.js with a Node backend, OpenRouter), required test-first work with every decision recorded, and chose a cheap model family over a frontier one; the evaluation then picked the model and its settings. I asked for the evaluation to make comparing models easy.
- I chose to deploy on my own server, behind a password.
- I used the deployed page as Nora would and sent it back three times: the contrast was too low, it was not clear how to resolve a "Must fix", and I expected to drag tasks in the timeline. Those became [D13](docs/DECISIONS.md) and [D19](docs/DECISIONS.md).

The checks I relied on: property tests against an independent brute-force solver; the graders' checker against the built server and the Docker image; the review pipeline against hand-checked model answers, including one that obeys the injection; browser tests with accessibility scans.

## Environment variables my review command needs

None. `./review` sends the plan to my server, which holds the model key and runs the review, and checks the review it gets back against the plan before writing it ([D20](docs/DECISIONS.md), controls in [docs/SECURITY.md](docs/SECURITY.md)). Optional:

- `REVIEW_TIMEOUT_SECONDS` (default 270).
- To call the model from your own computer instead: `REVIEW_LOCAL=1` with `OPENROUTER_API_KEY`, and optionally `REVIEW_MODEL` (default `deepseek/deepseek-v4.1-flash-1017`, chosen for low cost and strict structured outputs, pinned to a snapshot; [D5](docs/DECISIONS.md)) and `REVIEW_REASONING` (default `off`).

The deployed app is at https://planreviewer.213-133-98-90.sslip.io (password in the email; the scheduling API is open for your checker).
