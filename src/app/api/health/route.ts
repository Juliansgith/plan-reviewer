import { json } from "@/server/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return json({ status: "ok" });
}
