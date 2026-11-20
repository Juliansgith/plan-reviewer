import { describe, expect, it } from "vitest";
import { createPlanRepository } from "../plans";
import { handleGetPlan, handleListPlans } from "./plans";

const repository = createPlanRepository(
  new URL("../../../data", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);

describe("plans API", () => {
  it("lists the sample plans as JSON", async () => {
    const response = handleListPlans(repository);
    expect(response.status).toBe(200);
    const plans = (await response.json()) as { id: string }[];
    expect(plans.map((p) => p.id).sort()).toEqual([
      "harbour-run",
      "lantern-festival",
      "spring-market",
    ]);
  });

  it("returns one plan with its text", async () => {
    const response = handleGetPlan(repository, "spring-market");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { text: string }).text).toContain(
      "# Pellerby Spring Market",
    );
  });

  it("answers an unknown or hostile id with a JSON 404", async () => {
    for (const id of ["nope", "..%5C..%5CREADME", "../plans/spring-market"]) {
      const response = handleGetPlan(repository, id);
      expect(response.status).toBe(404);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("not_found");
    }
  });
});
