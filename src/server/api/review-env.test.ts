import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, OpenRouterClient } from "../openrouter";
import { reviewEndpointFromEnv } from "./review-env";

const HASH = "a".repeat(64);
const files: Record<string, string> = { "/run/secrets/openrouter_api_key": "sk-or-from-file\n" };
const readFile = (path: string) => {
  if (!(path in files)) throw new Error(`ENOENT: ${path}`);
  return files[path]!;
};

describe("reviewEndpointFromEnv", () => {
  it("reads the model key from a secret file, so it is not in the environment", () => {
    const endpoint = reviewEndpointFromEnv(
      {
        OPENROUTER_API_KEY_FILE: "/run/secrets/openrouter_api_key",
        REVIEW_API_TOKEN_SHA256: HASH.toUpperCase(),
      },
      readFile,
    );
    expect(endpoint.client).toBeInstanceOf(OpenRouterClient);
    expect(endpoint.tokenSha256).toBe(HASH);
    expect(endpoint.model).toBe(DEFAULT_MODEL);
  });

  it("falls back to OPENROUTER_API_KEY, and honours REVIEW_MODEL", () => {
    const endpoint = reviewEndpointFromEnv(
      { OPENROUTER_API_KEY: "sk-or-env", REVIEW_API_TOKEN_SHA256: HASH, REVIEW_MODEL: "x/y" },
      readFile,
    );
    expect(endpoint.client).not.toBeNull();
    expect(endpoint.model).toBe("x/y");
  });

  it("leaves the endpoint off when the key or the token hash is missing", () => {
    expect(reviewEndpointFromEnv({ REVIEW_API_TOKEN_SHA256: HASH }, readFile).client).toBeNull();
    expect(
      reviewEndpointFromEnv(
        { OPENROUTER_API_KEY_FILE: "/missing", REVIEW_API_TOKEN_SHA256: HASH },
        readFile,
      ).client,
    ).toBeNull();
    expect(reviewEndpointFromEnv({ OPENROUTER_API_KEY: "k" }, readFile).tokenSha256).toBeNull();
  });
});
