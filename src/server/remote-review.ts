// ./review's second way to reach a model, for people without an OpenRouter
// key: send the plan to a review server (POST /api/review, D20) with a bearer
// token. The token goes only over HTTPS, or plain HTTP to this computer, and
// never follows a redirect. What comes back is checked by the caller against
// the contract and the plan before anything is written.

export type RemoteOutcome =
  { ok: true; review: unknown } | { ok: false; exit: 1 | 2 | 3; lines: string[] };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The endpoint to call, or a message saying why the URL cannot be used. */
export function reviewEndpoint(base: string): URL | string {
  let url: URL;
  try {
    url = new URL(base.endsWith("/") ? base : `${base}/`);
  } catch {
    return `REVIEW_API_URL is not a URL: ${base}`;
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return "REVIEW_API_URL must start with https:// (plain http:// only for this computer), so the token is never sent unencrypted.";
  }
  return new URL("api/review", url);
}

type ErrorBody = { error?: { code?: string; message?: string; issues?: string[] } };

export async function requestRemoteReview(
  plan: string,
  options: { endpoint: URL; token: string; fetch: typeof fetch; timeoutMs: number },
): Promise<RemoteOutcome> {
  let response: Response;
  try {
    response = await options.fetch(options.endpoint.href, {
      method: "POST",
      headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
      body: JSON.stringify({ plan }),
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    const name = (error as Error).name;
    return {
      ok: false,
      exit: 3,
      lines: [
        name === "TimeoutError" || name === "AbortError"
          ? "The review server did not answer in time."
          : `Cannot reach the review server at ${options.endpoint.host}: ${(error as Error).message}`,
      ],
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Handled below: a refusal without a JSON body still has a status.
  }
  if (response.ok) {
    const review = (body as { review?: unknown } | null)?.review;
    return review === undefined
      ? { ok: false, exit: 1, lines: ["The review server's answer has no review in it."] }
      : { ok: true, review };
  }

  const error = (body as ErrorBody | null)?.error ?? {};
  const said = error.message ? `: ${error.message}` : ".";
  const status = response.status;
  if (status === 401 || status === 403) {
    return {
      ok: false,
      exit: 2,
      lines: [`The review server refused REVIEW_API_TOKEN (${status}). Check the token.`],
    };
  }
  if (error.code === "no_usable_review") {
    return {
      ok: false,
      exit: 1,
      lines: [`No usable review${said}`, ...(error.issues ?? []).map((issue) => `  - ${issue}`)],
    };
  }
  if (status === 429) {
    const wait = response.headers.get("retry-after");
    return {
      ok: false,
      exit: 3,
      lines: [
        `The review server is at its limit${said}${wait ? ` Try again in ${wait} seconds.` : ""}`,
      ],
    };
  }
  return {
    ok: false,
    exit: status >= 500 ? 3 : 2,
    lines: [`The review server answered ${status}${said}`],
  };
}
