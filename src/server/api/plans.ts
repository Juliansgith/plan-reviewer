// GET /api/plans and GET /api/plans/:id.

import type { PlanRepository } from "../plans";
import { json, refuse } from "./http";

export function handleListPlans(repository: PlanRepository): Response {
  return json(repository.list());
}

export function handleGetPlan(repository: PlanRepository, id: string): Response {
  const plan = repository.get(id);
  if (!plan) return refuse(404, "not_found", `There is no plan with the id "${id}".`);
  return json(plan);
}
