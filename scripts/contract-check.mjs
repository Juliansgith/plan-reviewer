// npm run contract: runs the graders' own checker, check_contract.py, against
// a real production server and against every stored review.
//
//   1. Starts the built app (next start) on a free port. Run `npm run build` first.
//      With CONTRACT_BASE_URL set, checks that server instead (for example a
//      Docker container or the deployed app) and starts nothing.
//   2. python check_contract.py schedule <url>
//   3. python check_contract.py review <file> for examples/ and data/reviews/
//   4. A few refusals the checker does not cover: bad input must get a JSON 4xx.

import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createServer } from "node:net";

const python = ["python3", "python"].find(
  (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0,
);
if (!python) {
  console.error("Python 3 is needed to run check_contract.py.");
  process.exit(2);
}

const freePort = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

let server;
let baseUrl = process.env.CONTRACT_BASE_URL;
if (!baseUrl) {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["scripts/start.mjs"], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1" },
  });
}

const stop = () => server?.kill();
process.on("exit", stop);

async function waitForHealth() {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no answer from ${baseUrl}/api/health after 60 s`);
}

let failures = 0;
const step = (label, ok, detail = "") => {
  console.log(`${ok ? "pass" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
};
const checker = (...args) =>
  spawnSync(python, ["check_contract.py", ...args], { encoding: "utf8" });

try {
  await waitForHealth();

  const schedule = checker("schedule", baseUrl);
  step(
    "check_contract.py schedule",
    schedule.status === 0,
    (schedule.stdout + schedule.stderr).trim(),
  );

  const reviews = [
    "examples/review-output.json",
    ...readdirSync("data/reviews")
      .filter((file) => file.endsWith(".json"))
      .map((file) => `data/reviews/${file}`),
  ];
  for (const file of reviews) {
    const result = checker("review", file);
    step(
      `check_contract.py review ${file}`,
      result.status === 0,
      (result.stdout + result.stderr).trim(),
    );
  }

  const refusals = [
    ["broken JSON", "{oops", 400],
    ["duplicate ids", JSON.stringify({ tasks: [task("A"), task("A")], deadline_day: 1 }), 422],
    ["unknown dependency", JSON.stringify({ tasks: [task("A", ["Z"])], deadline_day: 1 }), 422],
    [
      "zero duration",
      JSON.stringify({ tasks: [{ ...task("A"), duration_days: 0 }], deadline_day: 1 }),
      422,
    ],
    [
      "61 tasks",
      JSON.stringify({
        tasks: Array.from({ length: 61 }, (_, i) => task(`T${i}`)),
        deadline_day: 1,
      }),
      422,
    ],
  ];
  for (const [label, body, status] of refusals) {
    const response = await fetch(`${baseUrl}/api/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const isJson = (response.headers.get("content-type") ?? "").startsWith("application/json");
    step(`refuses ${label}`, response.status === status && isJson, `HTTP ${response.status}`);
  }

  const started = Date.now();
  const layered = [];
  for (let layer = 0; layer < 30; layer++) {
    const previous = layer === 0 ? [] : [`L${layer - 1}a`, `L${layer - 1}b`];
    layered.push(task(`L${layer}a`, previous), task(`L${layer}b`, previous));
  }
  const response = await fetch(`${baseUrl}/api/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tasks: layered, deadline_day: 40 }),
  });
  const seconds = (Date.now() - started) / 1000;
  step(
    "60-task worst case for the starter answers in under 10 s",
    response.ok && seconds < 10,
    `${seconds.toFixed(2)} s`,
  );
} catch (error) {
  step("server", false, String(error));
} finally {
  stop();
}

function task(id, depends_on = []) {
  return { id, name: id, owner: null, duration_days: 1, depends_on };
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll contract checks passed.");
process.exit(failures ? 1 : 0);
