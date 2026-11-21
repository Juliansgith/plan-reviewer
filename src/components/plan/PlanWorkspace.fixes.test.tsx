import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleTasks } from "@/core/schedule/schedule";
import { createPlanRepository, type PlanView } from "@/server/plans";
import { PlanWorkspace } from "./PlanWorkspace";

// A plan with a circle, two deadlines and a task nobody owns: every kind of
// remark Nora can act on from the page.
const PLAN = `# Pellerby Loop Run

The run is 20 days after kickoff.
Everything must be done 25 days after kickoff.

| Task | Who | How long | Can start after |
|---|---|---|---|
| Approve the course | Ann | 5 days | Insure the run |
| Insure the run | Bob | 3 days | Approve the course |
| Find marshals | | 4 days | - |
`;

const task = (id: string, name: string, owner: string | null, days: number, after: string[]) => ({
  id,
  name,
  owner,
  duration_days: days,
  depends_on: after,
  quote: name,
});

const REVIEW = {
  deadline_day: null,
  deadline_quote: null,
  tasks: [
    task("T1", "Approve the course", "Ann", 5, ["T2"]),
    task("T2", "Insure the run", "Bob", 3, ["T1"]),
    task("T3", "Find marshals", null, 4, []),
  ],
  findings: [
    {
      title: "Tasks wait on each other in a circle",
      detail:
        '"Approve the course" waits for "Insure the run", which waits for "Approve the course".',
      quote: "Approve the course",
      severity: "blocker",
      source: "code",
      kind: "cycle",
    },
    {
      title: "The plan gives different deadlines",
      detail: "One place says day 20. Another says day 25.",
      quote: "The run is 20 days after kickoff.",
      severity: "blocker",
      source: "code",
      kind: "deadline_conflict",
    },
    {
      title: 'No owner for "Find marshals"',
      detail: "Nobody is named for this task.",
      quote: "Find marshals",
      severity: "warning",
      source: "code",
      kind: "no_owner",
    },
  ],
  meta: {
    model: "test",
    attempts: 1,
    prompt_tokens: 1,
    completion_tokens: 1,
    cost_usd: null,
    generated_at: "2026-11-21T10:00:00.000Z",
  },
};

let dir: string;
let view: PlanView;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fixes-"));
  mkdirSync(join(dir, "plans"));
  mkdirSync(join(dir, "reviews"));
  writeFileSync(join(dir, "plans", "loop.md"), PLAN);
  writeFileSync(join(dir, "reviews", "loop.json"), JSON.stringify(REVIEW));
  view = createPlanRepository(dir).get("loop")!;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return new Response(JSON.stringify(scheduleTasks(body)), { status: 200 });
  });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  localStorage.clear();
});

const remark = (title: string) =>
  screen.getByRole("heading", { name: title, level: 4 }).closest("li")!;
const verdictHeading = () =>
  within(screen.getByRole("region", { name: "Verdict" })).getByRole("heading", { level: 2 });

describe("PlanWorkspace: acting on a remark", () => {
  it("explains that the committee fixes the plan, and the reply is how to ask", () => {
    render(<PlanWorkspace view={view} />);
    const remarks = screen.getByRole("region", { name: "What needs fixing" });
    expect(remarks).toHaveTextContent(
      "These are problems in the committee's plan. To get them fixed, send the plan back with the reply at the bottom of this list. If you already know the answer, try it here first and see the new dates.",
    );
    expect(
      within(remark("Tasks wait on each other in a circle")).getByText("What you can do"),
    ).toBeInTheDocument();
  });

  it("sorts a circle out with one click on the task that comes first", async () => {
    const user = userEvent.setup();
    render(<PlanWorkspace view={view} />);
    expect(verdictHeading()).toHaveTextContent("Can't be scheduled");

    const circle = remark("Tasks wait on each other in a circle");
    await user.click(within(circle).getByRole("button", { name: 'Do "Approve the course" first' }));

    expect(
      await within(circle).findByText("These tasks no longer wait for each other."),
    ).toBeInTheDocument();
    expect(within(circle).getByText("Sorted by your changes")).toBeInTheDocument();
    expect(within(circle).queryByText("Must fix")).not.toBeInTheDocument();
    expect(verdictHeading()).toHaveTextContent("No clear deadline");
    expect(
      within(screen.getByRole("region", { name: "Your changes" })).getByText(
        'Approve the course: no longer waits for "Insure the run"',
      ),
    ).toBeInTheDocument();
  });

  it("lets Nora pick which of the plan's deadlines to use", async () => {
    const user = userEvent.setup();
    render(<PlanWorkspace view={view} />);
    const deadlines = remark("The plan gives different deadlines");
    await user.click(within(deadlines).getByRole("button", { name: "Use day 25" }));
    expect(
      await within(deadlines).findByText("You chose day 25 as the deadline."),
    ).toBeInTheDocument();
    expect(screen.getByText("Deadline: none → day 25")).toBeInTheDocument();
  });

  it("opens the task editor at the right field", async () => {
    const user = userEvent.setup();
    render(<PlanWorkspace view={view} />);
    await user.click(
      within(remark('No owner for "Find marshals"')).getByRole("button", {
        name: "Choose who does it",
      }),
    );
    expect(screen.getByRole("combobox", { name: "Owner of Find marshals" })).toHaveFocus();
  });

  it("tells Nora that her changes stay with her until the committee sends a new plan", async () => {
    const user = userEvent.setup();
    render(<PlanWorkspace view={view} />);
    await user.click(screen.getByRole("button", { name: "Use day 20" }));
    expect(
      await within(screen.getByRole("region", { name: "Your changes" })).findByText(
        "Only you can see these changes. The committee's plan stays as it is until they send a new one.",
      ),
    ).toBeInTheDocument();
  });
});
