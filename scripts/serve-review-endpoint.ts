// Serves POST /api/review on its own, without Next.js, so the smoke test can
// run the real ./review against the real endpoint on any Node version. It
// reads the same settings as the deployed server (src/server/api/review-env.ts)
// and prints "listening <port>" once it is ready.
//
//   PORT=0 REVIEW_API_TOKEN_SHA256=... OPENROUTER_API_KEY=... npx tsx scripts/serve-review-endpoint.ts

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createReviewHandler } from "../src/server/api/review";
import { reviewEndpointFromEnv } from "../src/server/api/review-env";

const handle = createReviewHandler(reviewEndpointFromEnv(process.env));

const server = createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (typeof value === "string") headers.set(name, value);
  }
  const response =
    incoming.method === "POST" && incoming.url === "/api/review"
      ? await handle(
          new Request(`http://127.0.0.1${incoming.url}`, {
            method: "POST",
            headers,
            body: Buffer.concat(chunks),
          }),
        )
      : new Response("Not found", { status: 404 });
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => {
  console.log(`listening ${(server.address() as AddressInfo).port}`);
});
