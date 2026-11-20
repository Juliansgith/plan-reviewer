// A line-by-line TypeScript port of validate_schedule_response from
// check_contract.py, with the same messages. The API runs it on every
// schedule before sending it, and the tests use it as an oracle.

import type { ScheduleRequest } from "../contracts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

export function verifyScheduleResponse(request: ScheduleRequest, response: unknown): string[] {
  if (!isRecord(response)) return ["response must be an object"];

  const errors: string[] = [];
  const fields = [
    "status",
    "schedule",
    "end_day",
    "deadline_day",
    "meets_deadline",
    "days_late",
    "cycle",
  ];
  for (const field of fields) if (!(field in response)) errors.push(`missing ${field}`);
  if (errors.length) return errors;

  const tasks = new Map(request.tasks.map((task) => [task.id, task]));
  if (!isInt(response.deadline_day) || response.deadline_day !== request.deadline_day) {
    errors.push("deadline_day must match the request integer");
  }

  if (response.status === "cycle") {
    if (!Array.isArray(response.schedule) || response.schedule.length !== 0) {
      errors.push("cycle schedule must be empty");
    }
    for (const field of ["end_day", "meets_deadline", "days_late"]) {
      if (response[field] !== null) errors.push(`cycle ${field} must be null`);
    }
    const cycle = response.cycle;
    if (!Array.isArray(cycle) || cycle.length === 0) {
      errors.push("cycle must be a non-empty list of request ids");
    } else if (cycle.some((id) => typeof id !== "string" || !tasks.has(id))) {
      errors.push("cycle must contain only request ids");
    } else {
      const reachable = new Map<string, Set<string>>();
      for (const [id, task] of tasks) {
        const pending = [...task.depends_on];
        const visited = new Set<string>();
        while (pending.length) {
          const dependency = pending.pop()!;
          if (!visited.has(dependency)) {
            visited.add(dependency);
            pending.push(...(tasks.get(dependency)?.depends_on ?? []));
          }
        }
        reachable.set(id, visited);
      }
      const ids = cycle as string[];
      const first = ids[0]!;
      const fromFirst = reachable.get(first)!;
      if (
        !fromFirst.has(first) ||
        ids.some((id) => !fromFirst.has(id) || !reachable.get(id)!.has(first))
      ) {
        errors.push("cycle ids must lie on one circular dependency");
      }
    }
    return errors;
  }

  if (response.status !== "scheduled") return [...errors, "status must be scheduled or cycle"];
  if (!Array.isArray(response.cycle) || response.cycle.length !== 0)
    errors.push("scheduled cycle must be empty");
  for (const field of ["end_day", "days_late"]) {
    if (!isInt(response[field])) errors.push(`${field} must be an integer`);
  }
  if (typeof response.meets_deadline !== "boolean") errors.push("meets_deadline must be a boolean");
  if (!Array.isArray(response.schedule)) return [...errors, "schedule must be a list"];

  type Entry = { id: string; start_day: number; end_day: number };
  const scheduled = new Map<string, Entry>();
  response.schedule.forEach((entry: unknown, index: number) => {
    const prefix = `schedule[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    for (const field of ["id", "start_day", "end_day"]) {
      if (!(field in entry)) errors.push(`${prefix} missing ${field}`);
    }
    const id = entry.id;
    if (typeof id !== "string" || !tasks.has(id)) {
      errors.push(`${prefix} id must be an id from the request`);
      return;
    }
    if (scheduled.has(id)) errors.push(`${prefix} duplicate id ${id}`);
    scheduled.set(id, entry as Entry);
    if (!isInt(entry.start_day) || entry.start_day < 0) {
      errors.push(`${prefix} start_day must be a non-negative integer`);
    }
    if (!isInt(entry.end_day)) errors.push(`${prefix} end_day must be an integer`);
  });

  for (const id of tasks.keys()) {
    if (!scheduled.has(id)) errors.push(`missing task ${id} from schedule`);
  }
  if (errors.length) return errors;

  for (const [id, entry] of scheduled) {
    const task = tasks.get(id)!;
    if (entry.end_day - entry.start_day !== task.duration_days) {
      errors.push(`task ${id} end_day must equal start_day + duration_days`);
    }
    for (const dependency of task.depends_on) {
      if (entry.start_day < scheduled.get(dependency)!.end_day) {
        errors.push(`task ${id} depends on ${dependency} and starts before its end_day`);
      }
    }
  }

  const entries = [...scheduled.values()];
  entries.forEach((entry, index) => {
    const owner = tasks.get(entry.id)!.owner;
    if (owner === null) return;
    for (const other of entries.slice(index + 1)) {
      if (
        owner === tasks.get(other.id)!.owner &&
        Math.max(entry.start_day, other.start_day) < Math.min(entry.end_day, other.end_day)
      ) {
        errors.push(`tasks ${entry.id} and ${other.id} overlap for owner ${owner}`);
      }
    }
  });

  const endDay = entries.reduce((max, entry) => Math.max(max, entry.end_day), 0);
  if (response.end_day !== endDay) errors.push("end_day must equal the largest task end_day");
  if (response.meets_deadline !== Number(response.end_day) <= request.deadline_day) {
    errors.push("meets_deadline must equal (end_day <= deadline_day)");
  }
  if (response.days_late !== Math.max(0, Number(response.end_day) - request.deadline_day)) {
    errors.push("days_late must equal max(0, end_day - deadline_day)");
  }
  return errors;
}
