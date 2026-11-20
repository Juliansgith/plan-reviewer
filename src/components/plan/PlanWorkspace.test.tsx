import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleTasks } from "@/core/schedule/schedule";
import { createPlanRepository, type PlanView } from "@/server/plans";
import { PlanWorkspace } from "./PlanWorkspace";

const PLAN = `# Pellerby Test Fair

Everything must be done by day 6.

| Task | Who | How long | Can start after |
|---|---|---|---|
| Book the hall | Ann | 3 days | - |
| Print posters | Ann | 4 days | Book the hall |
| Find stewards | Bob | 2 days | - |
`;

const REVIEW = {
  deadline_day: 6,
  deadline_quote: "Everything must be done by day 6.",
  tasks: [
    {
      id: "T1",
      name: "Book the hall",
      owner: "Ann",
      duration_days: 3,
      depends_on: [],
      quote: "Book the hall",
    },
    {
      id: "T2",
      name: "Print posters",
      owner: "Ann",
      duration_days: 4,
      depends_on: ["T1"],
      quote: "Print posters",
    },
    {
      id: "T3",
      name: "Find stewards",
      owner: "Bob",
      duration_days: 2,
      depends_on: [],
      quote: "Find stewards",
    },
  ],
  findings: [
    {
      title: "Too few stewards",
      detail: "Two days may not be enough.",
      quote: "Find stewards",
      severity: "warning",
      source: "model",
      kind: "model",
    },
    {
      title: "A small note",
      detail: "Minor.",
      quote: null,
      severity: "note",
      source: "model",
      kind: "model",
    },
  ],
  meta: {
    model: "test",
    attempts: 1,
    prompt_tokens: 1,
    completion_tokens: 1,
    cost_usd: null,
    generated_at: "2026-11-20T10:00:00.000Z",
  },
};

let dir: string;
let view: PlanView;
const requests: unknown[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "workspace-"));
  mkdirSync(join(dir, "plans"));
  mkdirSync(join(dir, "reviews"));
  writeFileSync(join(dir, "plans", "fair.md"), PLAN);
  writeFileSync(join(dir, "reviews", "fair.json"), JSON.stringify(REVIEW));
  view = createPlanRepository(dir).get("fair")!;
  requests.length = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    return new Response(JSON.stringify(scheduleTasks(body)), { status: 200 });
  });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("PlanWorkspace", () => {
  it("leads with the verdict: how late, and why", () => {
    render(<PlanWorkspace view={view} />);
    const verdict = screen.getByRole("region", { name: "Verdict" });
    expect(within(verdict).getByRole("heading", { name: "1 day late" })).toBeInTheDocument();
    expect(
      within(verdict).getByText("Ann has 7 days of work and can only do one task at a time."),
    ).toBeInTheDocument();
  });

  it("shows where a remark comes from in the plan", async () => {
    const user = userEvent.setup();
    render(<PlanWorkspace view={view} />);
    const findings = screen.getByRole("region", { name: "What is wrong" });
    await user.click(within(findings).getAllByRole("button", { name: /show in plan/i })[0]!);
    const document = screen.getByRole("region", { name: "The plan" });
    const active = document.querySelector('mark[data-active="true"]');
    expect(active?.textContent).toBe("Find stewards");
  });

  it("lets Nora correct a duration and says what that changes", async () => {
    const user = userEvent.setup();
    render(<PlanWorkspace view={view} />);
    await user.click(screen.getByRole("button", { name: "Correct the review" }));
    const days = screen.getByRole("spinbutton", { name: "Days for Print posters" });
    await user.clear(days);
    await user.type(days, "2");
    expect(
      await screen.findByText(
        "Finishes on day 5 instead of day 7, 2 days sooner. Now on time, 1 day to spare.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Print posters: 4 → 2 days")).toBeInTheDocument();
    expect(requests.at(-1)).toMatchObject({
      deadline_day: 6,
      tasks: expect.arrayContaining([expect.objectContaining({ id: "T2", duration_days: 2 })]),
    });
    expect(
      within(screen.getByRole("region", { name: "Verdict" })).getByRole("heading", {
        name: "On time, 1 day to spare",
      }),
    ).toBeInTheDocument();
  });

  it("keeps corrections after a reload and can discard them", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PlanWorkspace view={view} />);
    await user.click(screen.getByRole("button", { name: "Correct the review" }));
    // A text input that suggests existing names from a datalist is a combobox.
    const owner = screen.getByRole("combobox", { name: "Owner of Print posters" });
    await user.clear(owner);
    await user.type(owner, "Cat");
    await screen.findByText("Print posters: owner Ann → Cat");
    unmount();

    render(<PlanWorkspace view={view} />);
    expect(await screen.findByText("Print posters: owner Ann → Cat")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard corrections" }));
    expect(screen.queryByText("Print posters: owner Ann → Cat")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Verdict" })).getByRole("heading", {
        name: "1 day late",
      }),
    ).toBeInTheDocument();
  });

  it("copies a reply for the committee that quotes their plan", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<PlanWorkspace view={view} />);
    await user.click(screen.getByRole("button", { name: "Copy a reply for the committee" }));
    expect(writeText).toHaveBeenCalledOnce();
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain("1 day late.");
    expect(text).toContain('Your plan says: "Find stewards"');
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
