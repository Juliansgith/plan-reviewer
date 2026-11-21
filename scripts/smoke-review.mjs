// Smoke test for ./review that needs no test framework, so it also runs on
// Node 20, the oldest version the brief promises. It starts a stand-in for
// OpenRouter, runs the real ./review script, and checks the output with the
// graders' check_contract.py: once calling the model directly
// (REVIEW_LOCAL=1), and once the default way, through the review endpoint
// (D20), with no key or setting and the endpoint holding the (stand-in) key.
//
//   node scripts/smoke-review.mjs

import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const answer = readFileSync("src/core/review/__fixtures__/spring-market.model.json", "utf8");
const server = createServer((request, response) => {
  request.resume();
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      model: "stand-in",
      choices: [{ message: { content: answer }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 },
    }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const dir = mkdtempSync(join(tmpdir(), "smoke-review-"));
const python = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);

const run = (args, env) =>
  new Promise((resolve) => {
    const child = spawn("sh", ["./review", ...args], {
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code));
  });

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

try {
  const out = join(dir, "spring-market.json");
  const code = await run(["data/plans/spring-market.md", out], {
    REVIEW_LOCAL: "1",
    OPENROUTER_API_KEY: "sk-or-smoke",
    OPENROUTER_BASE_URL: base,
  });
  check(`./review exits 0 on Node ${process.version}`, code === 0);
  check("./review writes the output file", existsSync(out));
  if (python && existsSync(out)) {
    check(
      "check_contract.py review passes",
      spawnSync(python, ["check_contract.py", "review", out]).status === 0,
    );
  }
  const noKey = join(dir, "no-key.json");
  const env = { ...process.env, REVIEW_LOCAL: "1" };
  delete env.OPENROUTER_API_KEY;
  const refused = await new Promise((resolve) => {
    const child = spawn("sh", ["./review", "data/plans/spring-market.md", noKey], {
      env,
      stdio: "ignore",
    });
    child.on("exit", (exitCode) => resolve(exitCode));
  });
  check(
    "REVIEW_LOCAL=1 without a key exits 2 and writes nothing",
    refused === 2 && !existsSync(noKey),
  );

  // The default: through the review endpoint, with no key or setting.
  const endpoint = spawn(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/serve-review-endpoint.ts"],
    {
      env: {
        ...process.env,
        PORT: "0",
        OPENROUTER_API_KEY: "sk-or-smoke",
        OPENROUTER_BASE_URL: base,
      },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  let output = "";
  const port = await new Promise((resolve, reject) => {
    endpoint.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /listening (\d+)/.exec(output);
      if (match) resolve(match[1]);
    });
    endpoint.on("exit", () => reject(new Error("the review endpoint did not start")));
  });
  try {
    const viaServer = join(dir, "via-server.json");
    const plain = { ...process.env };
    delete plain.OPENROUTER_API_KEY;
    delete plain.REVIEW_LOCAL;
    const served = await run(["data/plans/spring-market.md", viaServer], {
      ...plain,
      REVIEW_API_URL: `http://127.0.0.1:${port}`,
    });
    check(
      "./review with no key goes through the endpoint and exits 0",
      served === 0 && existsSync(viaServer),
    );
    if (python && existsSync(viaServer)) {
      check(
        "check_contract.py passes the endpoint's review",
        spawnSync(python, ["check_contract.py", "review", viaServer]).status === 0,
      );
    }
    const audit = output.split("\n").filter((line) => line.includes("review_request"));
    check(
      "the endpoint wrote one audit line, without the plan or the key",
      audit.length === 1 && !output.includes("Spring Market") && !output.includes("sk-or-smoke"),
    );
  } finally {
    endpoint.kill();
  }
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failures ? 1 : 0);
