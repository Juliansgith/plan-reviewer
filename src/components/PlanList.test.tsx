import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PlanSummary } from "@/server/plans";
import { PlanList } from "./PlanList";

const plan = (
  id: string,
  title: string,
  verdict: Partial<PlanSummary["verdict"]>,
): PlanSummary => ({
  id,
  title,
  verdict: {
    status: "on_time",
    end_day: 18,
    deadline_day: 21,
    days_late: 0,
    tasks: 8,
    blockers: 0,
    ...verdict,
  },
});

describe("PlanList", () => {
  it("shows each plan with a verdict anyone can read at a glance", () => {
    render(
      <PlanList
        plans={[
          plan("spring", "Spring Market", {}),
          plan("lantern", "Lantern Festival", {
            status: "late",
            end_day: 52,
            deadline_day: 45,
            days_late: 7,
            blockers: 2,
          }),
          plan("harbour", "Harbour Run", {
            status: "cycle",
            end_day: null,
            deadline_day: null,
            days_late: null,
          }),
          plan("new", "New Plan", { status: "not_reviewed", tasks: 0 }),
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Spring Market/ })).toHaveAttribute(
      "href",
      "/plans/spring",
    );
    expect(screen.getByText("On time, 3 days to spare")).toBeInTheDocument();
    expect(screen.getByText("7 days late")).toBeInTheDocument();
    expect(screen.getByText("Blocked: tasks wait on each other")).toBeInTheDocument();
    expect(screen.getByText("Not reviewed yet")).toBeInTheDocument();
    expect(
      screen.getByText("4 plans · 1 on time · 2 need attention · 1 not reviewed"),
    ).toBeInTheDocument();
  });

  it("says what to do when there are no plans", () => {
    render(<PlanList plans={[]} />);
    expect(screen.getByText(/No plans yet/)).toBeInTheDocument();
  });
});
