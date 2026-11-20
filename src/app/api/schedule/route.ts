import { handleSchedule } from "@/server/api/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleSchedule;
