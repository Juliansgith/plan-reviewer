# Codebase scorecard: plan-reviewer starter

20 Nov 2026. This scores the starter as received, before any work on it.

- **Method:** I read every file and checked the code against `docs/contracts.md`. Then I ran the starter to confirm the claims: in its own Docker image, natively on Windows, and in a browser. The "Verification run" section lists every result. Only the review command was not run, because it needs an API key.
- **Benchmarks:** three of your other projects, facet, TPF3-MP and X4-Online (see the benchmarks section).
- **Scale:** 0 to 10 for each dimension, where 10 is the standard of your best projects. The overall score is a weighted average. AI-agent maintainability and correctness carry the most weight.

The README says the starter "does everything badly" on purpose, so low scores are expected. The useful part is seeing which pieces are a solid base and which need rewriting.

## Overall: 3.0 / 10

| Dimension                         | Weight | Score | Why                                                                                                                        |
| --------------------------------- | ------ | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| Correctness against the contracts | 15     | 1     | Fails its own bundled example; crashes on cycles; returns 500s on bad input                                                |
| AI-agent maintainability          | 15     | 4     | Tiny, with a runnable contract checker, but no agent guide, no schema in code and no fast checks                           |
| Architecture                      | 10     | 4     | The pipeline has the right shape, but the validation layer that makes it safe is missing                                   |
| Code quality                      | 10     | 5     | Short and readable, but untyped, with no error handling and a naive algorithm                                              |
| Tests and verification            | 10     | 2     | Three happy-path tests, and no CI                                                                                          |
| AI integration                    | 10     | 1     | A one-line prompt with no schema and no checks; the shipped outputs show the injection working and a made-up quote         |
| Security                          | 10     | 3     | Secrets are handled correctly, but it is open to prompt injection and CPU exhaustion, and Python dependencies are unpinned |
| UX and product fit                | 10     | 1     | Raw text and JSON dumps; meets none of Nora's three needs                                                                  |
| Ops and reproducibility           | 5      | 5     | Good multi-stage Dockerfile and npm lockfile, but unpinned Python, a root container and Unix-only commands                 |
| Documentation                     | 5      | 7     | Precise contracts with examples and clear setup, but no architecture or decision notes                                     |

Weighted: (1×15 + 4×15 + 4×10 + 5×10 + 2×10 + 1×10 + 3×10 + 1×10 + 5×5 + 7×5) / 100 = 2.95.

Size, in non-blank lines:

- **Backend:** 69 lines of Python (`main.py` 31, `review.py` 19, `scheduler.py` 19).
- **Frontend:** 91 lines of TSX.
- **Tests:** 24 lines.
- **Contract checker:** 192 lines, which is more than the backend and frontend together.

## Verification run

On 20 Nov 2026 I ran the starter at commit `ea851f9` in three ways:

- **In its own Docker image:** Linux, Python 3.11.18. The unpinned requirements installed fastapi 0.165.0, starlette 1.10.0, pydantic 2.14.4, uvicorn 0.54.0 and anthropic 2.12.0.
- **Natively on Windows** with Python 3.12, for the two Windows-only claims.
- **In the built-in browser,** for the page.

Each result carries a label, following TPF3-MP's investigation template:

- **CONFIRMED:** seen directly.
- **MEASURED:** timed.
- **INFERRED:** reasoned from the code or the measurements, not seen.

| Claim                                                  | Result                                                                                                                                                                                                             | Label     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| The starter's tests pass                               | 3 passed in 0.27 s                                                                                                                                                                                                 | CONFIRMED |
| It fails its own contract check                        | `check_contract.py schedule` exits 1 with "tasks A and C overlap for owner Ann" and "tasks B and C overlap for owner Ann"                                                                                          | CONFIRMED |
| Tasks with the same owner overlap                      | Two 3-day tasks for Ann both run on days 0 to 3                                                                                                                                                                    | CONFIRMED |
| Cycles crash it                                        | A↔B, a self-dependency and the Harbour Run plan all return a 500 with `RecursionError`                                                                                                                             | CONFIRMED |
| Bad input gives a 500, not a 4xx                       | Missing `deadline_day` and an unknown dependency raise `KeyError`; an unknown plan id raises `FileNotFoundError`. All return the plain-text "Internal Server Error"                                                | CONFIRMED |
| A body that isn't a JSON object                        | 422 with a JSON body. This is FastAPI's own check, and the only bad input handled correctly                                                                                                                        | CONFIRMED |
| A null deadline crashes it                             | 500 with `TypeError: '<=' not supported between instances of 'int' and 'NoneType'`                                                                                                                                 | CONFIRMED |
| Bad input is accepted silently                         | Duplicate ids come back twice; durations of 0 and −3 are accepted (end day −3); 61 tasks are accepted                                                                                                              | CONFIRMED |
| Long chains crash it                                   | A 1,500-task chain returns a 500 with `RecursionError`                                                                                                                                                             | CONFIRMED |
| Run time grows exponentially                           | Layered graph: 32 tasks took 0.13 s, 36 tasks 0.48 s and 40 tasks 1.88 s, doubling with each layer. The 60-task request had not answered after 15 s, and the container stayed at 100% CPU after the client gave up | MEASURED  |
| How long that 60-task request takes                    | About 32 minutes (1.88 s × 2^10)                                                                                                                                                                                   | INFERRED  |
| About 40 such requests block the server                | Not tested; based on the default thread pool of 40                                                                                                                                                                 | INFERRED  |
| Lantern Festival is reported on time                   | The API returns end day 38 with `meets_deadline: true`, and the page says "Meets deadline: yes"                                                                                                                    | CONFIRMED |
| Spring Market finishes on day 18                       | The API returns end day 18                                                                                                                                                                                         | CONFIRMED |
| Harbour Run breaks the page                            | A blank page under the dropdown with no message. The console shows the 500 and a JSON parse error                                                                                                                  | CONFIRMED |
| The page is a raw dump                                 | The plan sits in a `<pre>` block and the review is raw JSON                                                                                                                                                        | CONFIRMED |
| £ is mis-decoded on Windows                            | The default encoding is cp1252, so `read_text()` returns "Â£"                                                                                                                                                      | CONFIRMED |
| Paths can escape `data/` on Windows                    | `GET /api/plans/..%5C..%5Ccanary-outside-data` returned a canary `.md` and `.json` pair placed outside `data/`, deleted afterwards. With forward slashes the same request gets a 404                               | CONFIRMED |
| The container runs as root and ships test dependencies | `id -un` returns root; pytest and httpx are installed                                                                                                                                                              | CONFIRMED |
| `make` is missing on Windows                           | `make` was not found on this machine                                                                                                                                                                               | CONFIRMED |
| The Dockerfile builds                                  | It builds cleanly, including `tsc --noEmit` for the frontend                                                                                                                                                       | CONFIRMED |
| The review accepts any JSON and crashes on non-JSON    | Not run, because it needs an API key                                                                                                                                                                               | INFERRED  |

One correction to the first draft: I had estimated the 60-task request would take hours. The measurements put it at about half an hour on this machine. The scores are unchanged.

## 1. Correctness against the contracts: 1/10

Running the starter confirmed all of these except the review's behaviour.

- **It fails its own example.** The bundled `examples/schedule-request.json` would fail `check_contract.py`. The scheduler ignores owners, so Ann's tasks A (days 0 to 3) and C (days 0 to 4) overlap, and so do B (3 to 5) and C.
- **Cycles crash it.** On a cycle, as in Harbour Run, `end_of` recurses until Python raises `RecursionError`, so the endpoint returns a 500 instead of `status: "cycle"`.
- **Bad input gives 500s or silent errors:**
  - Missing keys and unknown dependency ids raise `KeyError`, which becomes a 500 instead of a 4xx.
  - Duplicate ids are accepted and appear twice in the output.
  - It accepts `duration_days` below 1 and more than 60 tasks.
- **A null deadline crashes it.** If a review has `deadline_day: null`, `end_day <= deadline_day` raises `TypeError`.
- **It can blow the 10-second limit.** There is no memoisation. Take a valid 60-task request built as 30 layers of 2 tasks, where each task depends on both tasks in the layer before. That takes about 2^30 recursive calls for each task in the last layer. In the measurements, the time doubled with each layer, and the 60-task request had not answered after 15 seconds. By extrapolation it takes about 32 minutes.
- **The review accepts anything.** `./review` writes whatever JSON the model returns and exits 0, even when the shape or the quotes are wrong. A reply that isn't valid JSON makes it crash with a traceback.

What does work:

- Dependency-only scheduling, for small inputs with no cycles and no clashing owners.
- The command-line arguments and file output of `./review`.

## 2. AI-agent maintainability: 4/10

This judges how well a coding agent can understand, change and check this code without a person.

What helps:

- **It fits in one read.** The whole app is about 160 lines, with no indirection.
- **It has a runnable checker.** `check_contract.py` exits 0 or 1 and has matching `examples/`, so an agent can check its own contract work. This is the most useful thing here for an agent.
- **The contract doc is precise.** `docs/contracts.md` gives examples and covers edge cases: cycles, nulls and the whitespace rule for quotes.
- **TypeScript is strict.** `strict: true` is on, and `npm run build` runs `tsc --noEmit` first, so type errors stop the build.
- **The model client can be swapped.** `review_plan(text, client=None)` takes the client as a parameter, so a test can pass in a fake.

What hurts:

- **No CLAUDE.md or AGENTS.md.** Nothing tells an agent the rules or how to check its work. Rules it can't learn: don't hand-edit `data/reviews/`, generate reviews with `./review`, keep to the 60-task, 10-second and 300-second limits, and remember the commit history is graded.
- **The contracts exist only in prose and in the checker.** There are no pydantic models and no JSON Schema in the code. The TypeScript types were copied by hand and are already wrong:
  - A finding's `quote` can be null, but the type says string.
  - The schedule type has no `status`, `cycle` or `end_day`.
  - `meets_deadline` can be null, but the type says boolean.
- **No fast feedback for Python.** There are no type hints and no ruff, mypy or pyright config.
- **No single "is it done" command.** `check_contract.py` is not wired into pytest, make or CI.
- **The review can't be tested offline.** There is no fake model or recorded responses, so testing the review needs a key and network access, and results vary from run to run.
- **The data is a trap.** The stored reviews look like correct answers but are wrong (see `INVESTIGATION.md`). An agent that used them as test fixtures would build the injection and the made-up quote into the tests.
- **The environment drifts.** Python dependencies are unpinned, and the commands assume Unix (`make`, `.venv/bin/`), so they fail on Windows.
- **The test setup is fragile.** Tests import the app through `sys.path.insert` hacks, and there is no pytest config.

## 3. Architecture: 4/10

What's good:

- **The pipeline has the right shape.** The model extracts tasks, deterministic code schedules them, and the page shows the result. This matches the brief's "the model proposes and your code decides".
- **One package serves both entry points.** It runs as the command-line tool (`python -m app.review`) and as the API, and one container serves both the page and the API.
- **The scheduler is a pure function** with no I/O.

What's missing or weak:

- **There is no validation layer between the model and the scheduler,** so the "your code decides" half doesn't exist.
- **Data is untyped from end to end.** It travels as plain dicts, with no domain models.
- **Nora's corrections have nowhere to go.** There is no write path or storage for them. The data files are copied into the image and would be lost on every redeploy anyway.
- **`main.py` mixes concerns.** It does file reading, parsing and routing in one place, and works out its paths with `parents[2]`.
- **The frontend is one 83-line component** that does fetching, state and rendering together. Its types are not shared with the backend.

## 4. Code quality: 5/10

What's good: the code is short, with clear names, idiomatic FastAPI and React, and no dead code.

What's weak:

- **The scheduler is exponential.** Its recursion has no memoisation; see section 1.
- **There is no error handling anywhere in the backend:** no `try`/`except`, no `HTTPException` and no logging.
- **File reads have no explicit encoding.** `read_text()` and `open()` use the system default. On Windows that is cp1252 for Python 3.12, the version installed here, so the £ signs in the plans read as "Â£" and quotes containing them fail to match.
- **The frontend skips checks.**
  - It never checks `response.ok` and has no loading or error states.
  - If you switch plans quickly, it can show the wrong plan, because it neither cancels old requests nor ignores their late responses.
- **The plan list sorts in reverse alphabetical order** for no stated reason.

## 5. Tests and verification: 2/10

- **What exists:** three tests in 24 lines, which all pass in 0.27 s. One checks that the plans are listed, one schedules a single task, and one checks a single dependency.
- **Not covered:**
  - owners, cycles, and validation with 4xx responses;
  - null deadlines and the contract shape;
  - review parsing and quote checks;
  - timing with 60 tasks;
  - anything in the frontend.
- **No automation:** there is no CI and no `make check`.
- **In its favour:** the tests are fast and deterministic, and the contract checker is a ready-made source of truth to build on.

## 6. AI integration: 1/10

- **The prompt is one sentence.** It doesn't specify:
  - the output format or what each field means;
  - the rule that quotes must be word for word;
  - how to read the deadline;
  - that the plan text is content, not instructions.
- **Nothing checks the output.** There is no schema enforcement through tool use or structured output, no retry, no validation and no quote check.
- **The parsing breaks easily.** It runs `json.loads` on the raw reply, so a code fence or any text before the JSON makes it fail.
- **The shipped outputs show it failing:**
  - The Harbour Run review followed the instruction planted in the plan.
  - The Lantern Festival review contains a quote that is not in the plan.
- **In its favour:** the model can be set with `REVIEW_MODEL`, and the client can be swapped for a fake.

## 7. Security: 3/10

| Severity | Issue                                                                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | **Prompt injection.** The plan text goes straight into the prompt, and the stored Harbour Run review shows the attack working. In this product, that lets a committee write its own approval into its plan.                                                                                           |
| Medium   | **CPU exhaustion without logging in.** `/api/schedule` has no size limit, and the scheduling is exponential. One valid 60-task request keeps a CPU core at 100% for about half an hour (extrapolated from measurements). About 40 of them would probably use up the default thread pool (not tested). |
| Medium   | **No input validation.** Anything unexpected becomes a 500.                                                                                                                                                                                                                                           |
| Low      | **Loose pinning.** Python dependencies are neither pinned nor hashed, and the base images are pinned by tag, not by digest.                                                                                                                                                                           |
| Low      | **Container setup.** The container runs as root and ships the test dependencies, pytest and httpx.                                                                                                                                                                                                    |
| Low      | **No allow-list for `plan_id`.** On Linux this is safe: forward slashes get a 404. On a Windows host, an encoded backslash (`..%5C..%5C`) reads files outside `data/` wherever a matching `.md` and `.json` both exist. I confirmed this with a temporary canary pair.                                |
| Note     | **No authentication.** That is fine for a read-only demo, but it becomes a problem once Nora can save corrections.                                                                                                                                                                                    |

What it does right:

- The API key comes only from the environment.
- `.env` is listed in both `.gitignore` and `.dockerignore`.
- React escapes the text it renders.
- No CORS rules are opened.
- The frontend lockfile uses only the official npm registry.

## 8. UX and product fit: 1/10

- **The page dumps everything raw:** the plan sits in a `<pre>` block and the review is raw JSON. Below them come a table and "Meets deadline: yes/no".
- **It meets none of Nora's three needs:**
  - There is no at-a-glance verdict or count of days late.
  - Remarks are not linked to where they come from in the plan.
  - There is no way to correct the review and see what changes.
- **It ignores BRAND.md** and doesn't handle a cycle or a missing deadline.
- **It gives a wrong verdict.** On the stored Lantern review the page says "Meets deadline: yes", with an end day of 38. The plan is really at least 7 days late.
- **Harbour Run shows a blank page.** The 500 caused by the cycle is swallowed, and the only trace is an error in the browser console.

## 9. Ops and reproducibility: 5/10

What's good:

- **Docker:** a multi-stage Dockerfile that honours `$PORT`, and a `.dockerignore` that leaves out the venv, `node_modules`, `.env` and `.git`.
- **Installs:** `npm ci` installs from the lockfile, and the Makefile provides entry points.

What's weak:

- **Pinning:** Python dependencies are unpinned, with no Python lockfile.
- **Image:** no healthcheck, a root user, and test dependencies included.
- **Windows:** `make` and the `.venv/bin/` paths don't work there.
- **Process:** there is no CI. The README says "Python 3.11 or newer", but the image uses 3.11 and nothing tests other versions.

## 10. Documentation: 7/10

What's good:

- **The README** gives exact commands for setup, running, testing, the review and Docker.
- **`contracts.md`** is precise and has examples.
- **`BRAND.md`** is concrete: colour values, a type scale and a voice.

What's missing: an architecture overview, design decisions and known limitations. The `NOTES.md` template is empty on purpose.

## Benchmarks: what your other projects do that this one doesn't

Three read-only agents studied the benchmark projects. I spot-checked the claims that matter most against the files:

- facet's CI runs only when started by hand (`on: workflow_dispatch`).
- TPF3-MP's workspace lints deny unsafe code.
- X4-Online's `check.py` fails the run on any skipped test.
- Which projects have a CLAUDE.md or AGENTS.md.

The other details come from the agents' reports.

| Practice                         | facet                                                                                         | TPF3-MP                                                                                                                                                                                                        | X4-Online                                                                                                                 | plan-reviewer                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Agent guide loaded automatically | No. The rules are in `docs/AGENT_RULES.md`, which agents don't find on their own              | Yes. `CLAUDE.md` imports `AGENTS.md` (11.6 KB): branch flow, exact pre-push commands, "a behaviour change comes with a test that fails without it", and conflicts with `DECISIONS.md` get flagged, not settled | Yes. `CLAUDE.md` contains only `@AGENTS.md`: read order, hard don'ts, exact commands, and "a mocked test is not evidence" | None                                                      |
| Contract in code                 | Traits (`Backend`, `TextMeasurer`), with `ARCHITECTURE.md` described as "the contract"        | One protocol crate with `PROTOCOL_VERSION` and a changelog, and size-bounded types checked while decoding                                                                                                      | Prose specs and hand-written parsing                                                                                      | Prose plus an external checker; no types                  |
| Rules the tooling enforces       | Workspace clippy lints, but no rustfmt                                                        | `unsafe_code = "deny"`, clippy with `-D warnings`, and a `clippy.toml` that bans `HashMap` and `Instant` with a reason for each                                                                                | Nothing for Python                                                                                                        | Strict TypeScript only                                    |
| One command for all checks       | No                                                                                            | No: three cargo commands                                                                                                                                                                                       | Yes: `check.py`, where any skipped test fails the run unless allowed                                                      | `make test` (3 tests); the contract check runs separately |
| CI that blocks merges            | No: manual trigger only                                                                       | Yes: 3 operating systems, fmt, clippy and `test --locked`, plus a smoke test of the Docker image                                                                                                               | Yes: Linux and Windows jobs running `check.py`                                                                            | None                                                      |
| Tests with hostile input         | No: even the `.fig` parser isn't fuzzed                                                       | Yes: proptest `hostile_bytes` tests, plus security-regression and memory proof-of-concept tests                                                                                                                | Boundary limits, plus known-answer tests for the crypto                                                                   | None                                                      |
| Golden or differential tests     | Yes: goldens refreshed with an environment-variable switch, and a line diff on failure        | Differential: the Rust port is checked against the original Lua                                                                                                                                                | Known-answer vectors                                                                                                      | None                                                      |
| Reproducible builds              | `Cargo.lock` and `--locked`; non-root Docker image with a healthcheck; no pinned Rust version | Rust version pinned, `--locked` everywhere, and a distroless, non-root, read-only container                                                                                                                    | Dependencies pinned with `==` but no hashes; no Python version pin                                                        | npm lockfile only                                         |
| Evidence trail                   | Dated notes mixed in with the contract docs                                                   | `investigation/` uses a template where each claim is labelled CONFIRMED, MEASURED or INFERRED                                                                                                                  | About 60 dated reports, linked from the README                                                                            | `INVESTIGATION.md` (from this session)                    |
| Files over 800 lines             | 101                                                                                           | 79                                                                                                                                                                                                             | 18 (Python)                                                                                                               | 0                                                         |

**What all three share.** None of them has project settings, hooks or commands in `.claude/`, and none runs dependency audits. All three have many very large files. Plan-reviewer's small size is a real advantage for agents. Keep it by setting a file-size limit.

### Practices worth copying, by source

1. **A CLAUDE.md that only imports AGENTS.md** (TPF3-MP, X4-Online). Put in it:
   - the exact commands to run;
   - "a behaviour change comes with a test that fails without it" (TPF3-MP);
   - "say whether the evidence came from a fake or a real run" (X4-Online);
   - the traps from `INVESTIGATION.md`.
2. **One contract module with a version** (TPF3-MP). In this app, that means pydantic models with limits: at most 60 tasks, and maximum lengths for strings. Unlike TPF3-MP, extra fields must be allowed, because `docs/contracts.md` says both formats may carry them.
3. **One check command where a skipped test is a failure** (X4-Online). `make check` would run pytest, `check_contract.py` and `tsc`, and CI would run the same command.
4. **Hostile-input and security-regression tests** (TPF3-MP):
   - Hypothesis-generated bodies for `/api/schedule`, including the exponential 30-layer graph.
   - The Harbour Run injection kept as a permanent test fixture.
5. **Golden tests with a switch to refresh them** (facet). Record each sample plan's model reply once from `./review`, replay it through a fake client in tests, and compare the results with the stored goldens.
6. **A Docker smoke test in CI** (TPF3-MP, facet): build the image, run it as a non-root user, and run `check_contract.py schedule` against it.
7. **Label each claim as CONFIRMED, MEASURED or INFERRED** (TPF3-MP). This fits the brief's "show us why we should believe the answer". The scheduler's lower bound is the MEASURED proof that an end day can't be beaten.

### Weaknesses not to copy

- CI that only runs when started by hand (facet).
- Docs that drift from the code (facet).
- No type hints or type checker in Python (X4-Online).
- `sys.path` hacks in tests (X4-Online, and this starter).
- Very large files (all three).

## What would raise the score most, in order

1. **Pydantic models for both contracts at the API boundary.** Bad input then gets a 4xx with a JSON body, and the contracts have one source of truth. Allow extra fields, because the contract says both formats may carry them. Export a JSON Schema from them for the model's output format and for the TypeScript types. This improves correctness, security and agent maintainability.
2. **Rebuild the scheduler.**
   - Order of work: validate the input, detect cycles and name one, then schedule with one task at a time per owner. Use CP-SAT with a time limit, or list scheduling plus a lower bound.
   - Return the lower bound so the answer can be checked.
   - Tests: the bundled example, cycles, a 60-task stress test under 10 seconds, and the Lantern Festival bottleneck.
3. **Make the review safe.**
   - Delimit the plan text and constrain the output to the schema.
   - Check in code: shape, ids, quotes, and that a quote supports the deadline.
   - Retry once to repair, and exit non-zero if it still fails.
   - Report instructions found inside the plan as findings.
   - Add a fake model that replays recorded responses, for tests.
4. **One check command.** Add `make check` to run pytest, the contract check and `tsc`, and run it in CI. Add a CLAUDE.md with the rules, the commands and the traps from `INVESTIGATION.md`.
5. **Fix the basics.** Pin the Python dependencies, run the container as a non-root user, and open files as UTF-8.
6. **Rebuild the page.** Show the verdict first, then its cause and the findings ranked by importance. Link each quote to its place in the plan, and let Nora edit tasks and re-run the schedule.
