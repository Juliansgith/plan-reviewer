import type { ScheduleRequest } from "../contracts";
import type { ScheduleResult, SolveOptions } from "./types";

export function scheduleTasks(_request: ScheduleRequest, _options: SolveOptions = {}): ScheduleResult {
  throw new Error("not implemented");
}
