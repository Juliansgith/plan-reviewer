// The review endpoint's settings, from the server's environment (D20):
//   OPENROUTER_API_KEY_FILE  a file holding the model key (preferred: a
//                            mounted secret, so the key is not in the
//                            process environment), or
//   OPENROUTER_API_KEY       the key itself
//   REVIEW_API_TOKEN_SHA256  SHA-256 of the bearer token, in hex; the token
//                            itself never reaches the server
//   REVIEW_MODEL             optional; default as for ./review
// Without a key and a token hash the endpoint stays off.

import { readFileSync } from "node:fs";
import { DEFAULT_MODEL, OpenRouterClient } from "../openrouter";
import type { ReviewEndpoint } from "./review";

type Env = Record<string, string | undefined>;

function modelKey(env: Env, readFile: (path: string) => string): string | null {
  const file = env.OPENROUTER_API_KEY_FILE?.trim();
  if (file) {
    try {
      return readFile(file).trim() || null;
    } catch {
      console.error("review endpoint: OPENROUTER_API_KEY_FILE cannot be read; reviews are off");
      return null;
    }
  }
  return env.OPENROUTER_API_KEY?.trim() || null;
}

export function reviewEndpointFromEnv(
  env: Env,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): ReviewEndpoint {
  const apiKey = modelKey(env, readFile);
  return {
    tokenSha256: env.REVIEW_API_TOKEN_SHA256?.trim().toLowerCase() || null,
    client: apiKey
      ? new OpenRouterClient({ apiKey, baseUrl: env.OPENROUTER_BASE_URL?.trim() || undefined })
      : null,
    model: env.REVIEW_MODEL?.trim() || DEFAULT_MODEL,
  };
}
