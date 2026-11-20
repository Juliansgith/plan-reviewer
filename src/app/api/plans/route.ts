import { handleListPlans } from "@/server/api/plans";
import { plans } from "@/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return handleListPlans(plans);
}
