import { describe, expect, it } from "vitest";
import { REVIEW_JSON_SCHEMA } from "../core/review/prompt";
import { ModelServiceError, type ChatRequest } from "../core/review/types";
import { OpenRouterClient } from "./openrouter";

type Call = { url: string; init: RequestInit };

/** A fetch stand-in that answers from a list and records every call. */
function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetch: fetchImpl as typeof fetch };
}

const ok = (content: string, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      model: "deepseek/deepseek-v4.1-flash-1017",
      choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1200, completion_tokens: 800, cost: 0.00066 },
      ...extra,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
const failure = (status: number, message = "nope", headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code: status, message } }), { status, headers });

const request: ChatRequest = {
  model: "deepseek/deepseek-v4.1-flash-1017",
  messages: [{ role: "user", content: "hi" }],
  responseFormat: REVIEW_JSON_SCHEMA,
  temperature: 0,
  maxTokens: 1000,
};

function client(responses: (Response | Error)[]) {
  const fake = fakeFetch(responses);
  const delays: number[] = [];
  const instance = new OpenRouterClient({
    apiKey: "sk-or-test",
    fetch: fake.fetch,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  return { instance, calls: fake.calls, delays };
}

describe("OpenRouterClient", () => {
  it("posts a strict structured-output request to the chat completions endpoint", async () => {
    const { instance, calls } = client([ok("{}")]);
    await instance.complete(request);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-or-test");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({
      model: request.model,
      temperature: 0,
      max_tokens: 1000,
      messages: request.messages,
      response_format: { type: "json_schema", json_schema: REVIEW_JSON_SCHEMA },
      provider: { require_parameters: true },
    });
    expect(body).not.toHaveProperty("reasoning");
  });

  it("passes the reasoning setting through when the request has one", async () => {
    const { instance, calls } = client([ok("{}")]);
    await instance.complete({ ...request, reasoning: { enabled: false } });
    expect(JSON.parse(String(calls[0]!.init.body)).reasoning).toEqual({ enabled: false });
  });

  it("returns the content, the model that answered, the finish reason and the usage", async () => {
    const { instance } = client([ok('{"a":1}')]);
    await expect(instance.complete(request)).resolves.toEqual({
      content: '{"a":1}',
      model: "deepseek/deepseek-v4.1-flash-1017",
      finishReason: "stop",
      usage: { promptTokens: 1200, completionTokens: 800, cost: 0.00066 },
    });
  });

  it("waits as long as Retry-After asks on 429, then succeeds", async () => {
    const { instance, calls, delays } = client([
      failure(429, "slow down", { "retry-after": "3" }),
      ok("{}"),
    ]);
    await instance.complete(request);
    expect(calls).toHaveLength(2);
    expect(delays).toEqual([3000]);
  });

  it("retries server errors with growing delays, then reports the service unavailable", async () => {
    const { instance, calls, delays } = client([
      failure(503),
      failure(502),
      failure(500),
      failure(503),
    ]);
    const error = await instance.complete(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelServiceError);
    expect((error as ModelServiceError).kind).toBe("unavailable");
    expect(calls).toHaveLength(4);
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it("retries an error that arrives inside a 200 response", async () => {
    const { instance, calls } = client([
      new Response(JSON.stringify({ error: { code: 502, message: "upstream" } }), { status: 200 }),
      ok("{}"),
    ]);
    await instance.complete(request);
    expect(calls).toHaveLength(2);
  });

  it("retries a network failure", async () => {
    const { instance, calls } = client([new TypeError("fetch failed"), ok("{}")]);
    await instance.complete(request);
    expect(calls).toHaveLength(2);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [402, "payment"],
    [400, "bad_request"],
    [404, "bad_request"],
  ] as const)("does not retry %d and reports it as %s", async (status, kind) => {
    const { instance, calls } = client([failure(status, "explained")]);
    const error = await instance.complete(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelServiceError);
    expect((error as ModelServiceError).kind).toBe(kind);
    expect((error as Error).message).toContain("explained");
    expect(calls).toHaveLength(1);
  });

  it("reports a timeout when the caller's signal fires", async () => {
    const { instance } = client([new DOMException("The operation timed out.", "TimeoutError")]);
    const error = await instance
      .complete({ ...request, signal: AbortSignal.timeout(1) })
      .catch((e: unknown) => e);
    expect((error as ModelServiceError).kind).toBe("timeout");
  });

  it("never puts the API key in an error message", async () => {
    const { instance } = client([failure(401, "bad key sk-or-test")]);
    const error = (await instance.complete(request).catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain("sk-or-test");
  });

  it("treats a missing message as empty content, so the review asks again", async () => {
    const { instance } = client([
      new Response(
        JSON.stringify({
          model: "m",
          choices: [{ message: { content: null }, finish_reason: "stop" }],
        }),
        {
          status: 200,
        },
      ),
    ]);
    await expect(instance.complete(request)).resolves.toMatchObject({ content: "" });
  });
});
