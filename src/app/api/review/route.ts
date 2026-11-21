import { createReviewHandler } from "@/server/api/review";
import { reviewEndpointFromEnv } from "@/server/api/review-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Built on the first request, not at import: the build has no secrets, and
// the limits must be shared by every request this server handles.
let handle: ((request: Request) => Promise<Response>) | null = null;

export function POST(request: Request): Promise<Response> {
  handle ??= createReviewHandler(reviewEndpointFromEnv(process.env));
  return handle(request);
}
