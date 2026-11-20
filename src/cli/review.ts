// Entry point for ./review <plan.md> <out.json>. All logic lives in
// src/server/review-command.ts so it can be tested without a process.

import { runReviewCommand } from "../server/review-command";

process.exitCode = await runReviewCommand(process.argv.slice(2), process.env, {
  stderr: (line) => process.stderr.write(`${line}\n`),
});
