# Plan reviewer

Reviews the event plans that volunteer committees send to Pellerby Town Council. A model reads a plan and lists its tasks and findings; code checks every part of that answer against the plan, schedules the work, and proves how early it can finish; a page shows the events officer, at a glance, whether the plan can make its date, what is wrong, and where each remark comes from in the plan. She can correct the review and see what changes.

- The brief: [docs/BRIEF.md](docs/BRIEF.md). The two fixed formats: [docs/contracts.md](docs/contracts.md).
- How it fits together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Why each choice was made: [docs/DECISIONS.md](docs/DECISIONS.md).
- How the scheduler finds and proves the earliest end day: [docs/SCHEDULER.md](docs/SCHEDULER.md).
- The hand-in note: [NOTES.md](NOTES.md).

## Requirements

- Node.js 20.9 or newer to run the app and `./review`. Node 22.12 or newer to run the tests (Vitest needs it). `.nvmrc` names the version CI uses.
- Python 3, only for the graders' `check_contract.py`.
- An OpenRouter API key, only for `./review` ([openrouter.ai/keys](https://openrouter.ai/keys)).
- Optional: Docker, and `make` (every target below also has the plain command).

## Run it

```sh
npm ci                        # make setup
npm run build
PORT=8000 npm start           # make run; open http://localhost:8000
```

`npm start` runs the same standalone server as the Docker image, on `PORT` (default 3000), reading plans and reviews from `./data` (or `DATA_DIR`). On Windows, use Git Bash or WSL for the commands with `VAR=value` in front, or set the variable first.

## Review a plan

```sh
export OPENROUTER_API_KEY=sk-or-...      # or put it in .env (see .env.example) and: set -a; . ./.env; set +a
./review data/plans/spring-market.md out/spring-market.json
```

No OpenRouter key? Set `REVIEW_API_URL` and `REVIEW_API_TOKEN` instead (the token comes from the server's owner). `./review` then sends the plan to that server, which runs the same review with its own key, and checks the answer against the plan before writing it ([D20](docs/DECISIONS.md), [docs/SECURITY.md](docs/SECURITY.md)).

`./review` exits 0 when it wrote a verified review, 1 when the model gave no usable answer after three attempts, 2 for a usage or setup problem (arguments, plan file, API key), and 3 when OpenRouter is unavailable or out of credit. It writes nothing unless it exits 0. Run `./review --help` for details. On Windows without a POSIX shell, `npm run review -- <plan.md> <out.json>` does the same.

| Variable                 | Needed | Default                             | Purpose                                                                                                    |
| ------------------------ | ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`     | yes¹   |                                     | OpenRouter key                                                                                             |
| `REVIEW_API_URL`         | no¹    |                                     | A review server that holds a key, used only without `OPENROUTER_API_KEY`; must be `https://`               |
| `REVIEW_API_TOKEN`       | no¹    |                                     | The token for that server                                                                                  |
| `REVIEW_MODEL`           | no     | `deepseek/deepseek-v4.1-flash-1017` | Any OpenRouter model that supports structured outputs                                                      |
| `REVIEW_TIMEOUT_SECONDS` | no     | `270`                               | Total time budget, including repair rounds                                                                 |
| `REVIEW_REASONING`       | no     | `off`                               | `low`, `medium` or `high` turn on model reasoning; off is faster and more reliable (docs/DECISIONS.md, D5) |
| `OPENROUTER_BASE_URL`    | no     | `https://openrouter.ai/api/v1`      | For tests and proxies                                                                                      |

¹ Either `OPENROUTER_API_KEY`, or both `REVIEW_API_URL` and `REVIEW_API_TOKEN`.

The stored reviews in `data/reviews/` are what `./review` wrote, unedited. The page re-checks each one when it loads it and refuses to show one whose quotes or deadline are not in the plan.

To compare models on the three sample plans against the facts in [docs/INVESTIGATION.md](docs/INVESTIGATION.md): `EVAL_MODELS="model-a,model-b" npm run eval`.

## Check it

```sh
npm test               # unit, property, component and API tests (make test)
npm run check          # everything CI runs: format, lint, types, tests, build, contract (make check)
npm run test:e2e       # browser tests and accessibility scans; needs a build and `npx playwright install chromium`
```

The graders' checker, against a running server or a review file:

```sh
python3 check_contract.py schedule http://localhost:8000
python3 check_contract.py review data/reviews/spring-market.json
```

`npm run contract` starts the built app on a free port and runs both, plus refusal and timing checks. `CONTRACT_BASE_URL=<url> npm run contract` checks a server that is already running, such as the Docker container or the deployed app.

## Deployed

The app runs at [planreviewer.213-133-98-90.sslip.io](https://planreviewer.213-133-98-90.sslip.io). The page needs a password, shared outside the repository; the scheduling API is open so the contract checker can reach it. How it is deployed and how to redeploy: [docs/DEPLOY.md](docs/DEPLOY.md).

## Docker

```sh
docker build -t plan-reviewer .
docker run -p 8000:8000 plan-reviewer          # PORT=8000 by default
```

The image runs the standalone server as the unprivileged `node` user, works with a read-only file system (`--read-only --tmpfs /tmp`), and has a health check on `/api/health`.

## API

- `POST /api/schedule`: the contract endpoint. At most 60 tasks, answers well within 10 seconds. Bad input gets a JSON 4xx: 400 broken JSON, 413 too large, 422 contract errors with every problem listed. Answers carry extra fields the contract allows: `proof` (lower bound, its reason, whether the end day is proven optimal) and `critical_path`.
- `POST /api/review`: `{ "plan": "<markdown>" }` with `Authorization: Bearer <token>` returns `{ "review": ... }`, made by the same pipeline as `./review` with the server's key. Off unless the server is configured; 401 without a valid token; 429 at its limits. Controls: [docs/SECURITY.md](docs/SECURITY.md).
- `GET /api/plans`, `GET /api/plans/:id`: plans with their verified reviews, quote positions and schedules.
- `GET /api/health`.

## Layout

```
src/core/        Pure logic, no I/O: contracts, scheduler, review pipeline, text matching
src/server/      Node side: OpenRouter client, ./review command, plan repository, API handlers
src/ui/          Page logic without React: verdict wording, corrections, markdown, reply text
src/components/  React components
src/app/         Next.js pages and route handlers (thin)
src/cli/         Entry points for ./review and npm run eval
e2e/             Playwright browser tests
scripts/         Contract check, review smoke test, scheduler benchmark, server start
data/            Sample plans and their stored reviews
docs/            Brief, contracts, architecture, decisions, scheduler, investigation
```
