# Scorecard after the rebuild

20 Nov 2026, at commit `c3e1cf1`, scored on the same ten dimensions and weights as the starter ([SCORECARD-STARTER.md](SCORECARD-STARTER.md), 3.0 / 10). Every claim below was checked by running something; the evidence column says what.

## Overall: 9.4 / 10

| Dimension                         | Weight | Starter | Now | Evidence                                                                                                                                                                                            | What keeps it from 10                                                                                    |
| --------------------------------- | ------ | ------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Correctness against the contracts | 15     | 1       | 10  | `check_contract.py` passes against the built server and the Docker image; every answer passes its port at runtime; 400 random plans match a brute-force optimum                                     |                                                                                                          |
| AI-agent maintainability          | 15     | 4       | 9.5 | AGENTS.md and CLAUDE.md; one `npm run check`; one schema per contract; tests beside code; no source file over 300 lines; fixtures apart from stored data                                            | `npm run eval` needs a paid key, so an agent cannot check model quality alone                            |
| Architecture                      | 10     | 4       | 9.5 | Pure core shared by CLI, API and page; thin adapters; the page uses the contract endpoint                                                                                                           | The solver runs on the request thread (see Security)                                                     |
| Code quality                      | 10     | 5       | 9.5 | Strict TypeScript, no `any`, zero lint warnings, Prettier, small focused modules                                                                                                                    | Some non-null assertions where the types cannot see an invariant                                         |
| Tests and verification            | 10     | 2       | 9.5 | 205 unit, property and component tests (93% statements, 81% branches, enforced); 22 browser tests on desktop and phone with axe; contract, smoke and Docker jobs in CI                              | No mutation testing                                                                                      |
| AI integration                    | 10     | 1       | 8   | Verified quotes, repair rounds, code-settled deadline, injection defences, code findings, exit codes; tested with scripted answers, including one that obeys the injection                          | Not yet run against the real model: `npm run eval` and the stored reviews wait for the API key           |
| Security                          | 10     | 3       | 9.5 | Injection handled in four layers; 256 KB body cap; id allow-list; CSP and frame headers; non-root, read-only, capability-free container; pinned dependencies, actions and base image; key redaction | A deliberately hard 60-task request can hold the solver for up to 3 s of CPU, and there is no rate limit |
| UX and product fit                | 10     | 1       | 9   | Verdict first with its cause; remarks grouped by what must change, each linked to its words in the plan; corrections with what they change; a reply that quotes the plan; WCAG AA; phone layout     | Not yet tried by the events officer; real reviews pending                                                |
| Ops and reproducibility           | 5      | 5       | 9   | `npm ci` from an exact lockfile; digest-pinned image; CI on every push; Dependabot                                                                                                                  | Not deployed yet                                                                                         |
| Documentation                     | 5      | 7       | 10  | README, architecture, sixteen decisions, scheduler method and evidence, investigation, hand-in note                                                                                                 |                                                                                                          |

Weighted: (10×15 + 9.5×15 + 9.5×10 + 9.5×10 + 9.5×10 + 8×10 + 9.5×10 + 9×10 + 9×5 + 10×5) / 100 = 9.4.

## To reach 10

1. Put the OpenRouter key in `.env`, run `npm run eval`, then regenerate the three stored reviews with `./review`. Fix whatever the real model gets wrong, with a test for each fix.
2. Deploy the Docker image and run `CONTRACT_BASE_URL=<url> npm run contract` against it.
3. Move the solver to a worker thread with a small queue and add a per-client rate limit on `/api/schedule`.
4. Fill in the time spent and the account of AI use in NOTES.md.
