import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseReview } from "../core/contracts";
import { runReviewCommand } from "./review-command";

const root = new URL("../../", import.meta.url);
const planPath = new URL("data/plans/spring-market.md", root).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
const answer = readFileSync(
  new URL("src/core/review/__fixtures__/spring-market.model.json", root),
  "utf8",
);

const completion = (content: string) =>
  new Response(
    JSON.stringify({
      model: "deepseek/deepseek-v4.1-flash-1017",
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.000012 },
    }),
    { status: 200 },
  );

let dir: string;
let messages: string[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "review-"));
  messages = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(args: string[], env: Record<string, string | undefined>, responses: Response[] = []) {
  return runReviewCommand(args, env, {
    stderr: (line) => messages.push(line),
    fetch: (async () => responses.shift() ?? new Response("{}", { status: 500 })) as typeof fetch,
    sleep: async () => {},
  });
}
const env = { OPENROUTER_API_KEY: "sk-or-test" };

describe("./review command", () => {
  it("writes a contract-valid review and exits 0", async () => {
    const out = join(dir, "nested", "spring-market.json");
    const code = await run([planPath, out], env, [completion(answer)]);
    expect(code).toBe(0);
    const review = JSON.parse(readFileSync(out, "utf8"));
    expect(parseReview(review).ok).toBe(true);
    expect(review.deadline_day).toBe(21);
    expect(readdirSync(join(dir, "nested"))).toEqual(["spring-market.json"]);
    expect(messages.join("\n")).toMatch(/8 tasks/);
  });

  it("exits 2 with usage help when arguments are wrong", async () => {
    expect(await run([], env)).toBe(2);
    expect(await run([planPath], env)).toBe(2);
    expect(messages.join("\n")).toContain("Usage: ./review <plan.md> <out.json>");
  });

  it("exits 0 with help for --help", async () => {
    expect(await run(["--help"], env)).toBe(0);
  });

  it("exits 2 when the plan cannot be read", async () => {
    expect(await run([join(dir, "missing.md"), join(dir, "out.json")], env)).toBe(2);
    expect(messages.join("\n")).toMatch(/Cannot read the plan/);
  });

  it("exits 2 and names the variable when the API key is missing", async () => {
    const out = join(dir, "out.json");
    expect(await run([planPath, out], {})).toBe(2);
    expect(messages.join("\n")).toContain("OPENROUTER_API_KEY");
    expect(existsSync(out)).toBe(false);
  });

  it("exits 1 and writes nothing when no usable review comes back", async () => {
    const bad = JSON.parse(answer);
    bad.tasks[0].quote = "Words that are not in the plan";
    const out = join(dir, "out.json");
    const code = await run(
      [planPath, out],
      env,
      [1, 2, 3].map(() => completion(JSON.stringify(bad))),
    );
    expect(code).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(messages.join("\n")).toContain("Words that are not in the plan");
  });

  it("exits 2 when OpenRouter refuses the key, and 3 when it is unavailable", async () => {
    const out = join(dir, "out.json");
    expect(
      await run([planPath, out], env, [
        new Response('{"error":{"message":"no"}}', { status: 401 }),
      ]),
    ).toBe(2);
    expect(
      await run(
        [planPath, out],
        env,
        [500, 500, 500, 500].map((s) => new Response("{}", { status: s })),
      ),
    ).toBe(3);
    expect(existsSync(out)).toBe(false);
  });

  it("uses REVIEW_MODEL when it is set", async () => {
    const out = join(dir, "out.json");
    let sentModel = "";
    const code = await runReviewCommand(
      [planPath, out],
      { ...env, REVIEW_MODEL: "qwen/qwen3.8-flash" },
      {
        stderr: () => {},
        fetch: (async (_url: unknown, init?: RequestInit) => {
          sentModel = JSON.parse(String(init?.body)).model;
          return completion(answer);
        }) as typeof fetch,
      },
    );
    expect(code).toBe(0);
    expect(sentModel).toBe("qwen/qwen3.8-flash");
  });

  it("sends reasoning off by default, and REVIEW_REASONING when it is set", async () => {
    const sent: unknown[] = [];
    const io = {
      stderr: () => {},
      fetch: (async (_url: unknown, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)).reasoning);
        return completion(answer);
      }) as typeof fetch,
    };
    expect(await runReviewCommand([planPath, join(dir, "a.json")], env, io)).toBe(0);
    expect(
      await runReviewCommand([planPath, join(dir, "b.json")], { ...env, REVIEW_REASONING: "low" }, io),
    ).toBe(0);
    expect(sent).toEqual([{ enabled: false }, { effort: "low" }]);
  });

  it("exits 2 for an unknown REVIEW_REASONING value", async () => {
    expect(await run([planPath, join(dir, "c.json")], { ...env, REVIEW_REASONING: "lots" })).toBe(2);
    expect(messages.join("\n")).toContain("REVIEW_REASONING must be one of off, low, medium, high");
  });
});

describe("the real CLI process", () => {
  it("reviews a plan against a stand-in OpenRouter server", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          model: "stand-in",
          choices: [{ message: { content: answer }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    const out = join(dir, "cli.json");
    writeFileSync(join(dir, "marker"), "");
    try {
      const code = await new Promise<number>((resolve) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "src/cli/review.ts", planPath, out],
          {
            cwd: new URL(".", root),
            env: {
              ...process.env,
              OPENROUTER_API_KEY: "sk-or-test",
              OPENROUTER_BASE_URL: `http://127.0.0.1:${port}`,
            },
            stdio: "ignore",
          },
        );
        child.on("exit", (exitCode) => resolve(exitCode ?? -1));
      });
      expect(code).toBe(0);
      expect(parseReview(JSON.parse(readFileSync(out, "utf8"))).ok).toBe(true);
    } finally {
      server.close();
    }
  }, 30_000);
});
