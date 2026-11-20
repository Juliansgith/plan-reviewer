import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@/core/contracts";
import { scheduleTasks } from "@/core/schedule/schedule";
import { TaskTable } from "./TaskTable";

const tasks: Task[] = [
  { id: "T1", name: "Book the hall", owner: "Ann", duration_days: 3, depends_on: [] },
  { id: "T2", name: "Print posters", owner: "Ann", duration_days: 4, depends_on: ["T1"] },
];

function setup(editing: boolean) {
  const onChange = vi.fn<(tasks: Task[]) => void>();
  const onSelect = vi.fn<(id: string) => void>();
  render(
    <TaskTable
      tasks={tasks}
      schedule={scheduleTasks({ tasks, deadline_day: 10 })}
      editing={editing}
      active={null}
      cycleIds={new Set()}
      hasQuote={() => true}
      onSelect={onSelect}
      onChange={onChange}
    />,
  );
  return { onChange, onSelect, user: userEvent.setup() };
}

describe("TaskTable", () => {
  it("shows each task with its schedule, and links its name to the plan", async () => {
    const { onSelect, user } = setup(false);
    const row = screen.getByRole("row", { name: /Print posters/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Print posters", "Ann", "4", "Book the hall", "3", "7"]);
    await user.click(screen.getByRole("button", { name: "Book the hall" }));
    expect(onSelect).toHaveBeenCalledWith("task:T1");
  });

  it("removes a task and every reference to it", async () => {
    const { onChange, user } = setup(true);
    await user.click(screen.getByRole("button", { name: "Remove Book the hall" }));
    expect(onChange).toHaveBeenCalledWith([{ ...tasks[1], depends_on: [] }]);
  });

  it("adds a task with the next free id", async () => {
    const { onChange, user } = setup(true);
    await user.click(screen.getByRole("button", { name: "Add a task" }));
    expect(onChange.mock.calls[0]![0].at(-1)).toEqual({
      id: "T3",
      name: "New task",
      owner: null,
      duration_days: 1,
      depends_on: [],
    });
  });

  it("changes what a task waits for", async () => {
    const { onChange, user } = setup(true);
    await user.click(screen.getByText("Nothing"));
    await user.click(screen.getByRole("checkbox", { name: "Print posters" }));
    expect(onChange).toHaveBeenCalledWith([{ ...tasks[0], depends_on: ["T2"] }, tasks[1]]);
  });

  it("refuses a duration below 1 without passing it on", async () => {
    const { onChange, user } = setup(true);
    const days = screen.getByRole("spinbutton", { name: "Days for Book the hall" });
    await user.clear(days);
    await user.type(days, "0");
    expect(days).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
  });
});
