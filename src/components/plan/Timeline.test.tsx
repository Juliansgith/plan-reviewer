import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/core/contracts";
import { scheduleTasks } from "@/core/schedule/schedule";
import type { ScheduledResult } from "@/core/schedule/types";
import { Timeline } from "./Timeline";

const TASKS: Task[] = [
  { id: "T1", name: "Book the hall", owner: "Ann", duration_days: 3, depends_on: [] },
  { id: "T2", name: "Print posters", owner: "Ann", duration_days: 4, depends_on: ["T1"] },
  { id: "T3", name: "Find stewards", owner: "Bob", duration_days: 2, depends_on: [] },
];
const schedule = scheduleTasks({ tasks: TASKS, deadline_day: 6 }) as ScheduledResult;

// jsdom has no layout. Each person's row is 40px tall, from y = 100; the
// day track is 700px wide, so with 7 days on the axis a day is 100px.
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const row = Number(this.getAttribute("data-row") ?? -1);
    const top = row < 0 ? 0 : 100 + 40 * row;
    return DOMRect.fromRect({ x: 200, y: top, width: row < 0 ? 0 : 700, height: 40 });
  });
});
afterEach(() => vi.restoreAllMocks());

function setup() {
  const onSelect = vi.fn();
  const onChangeTask = vi.fn();
  render(
    <Timeline
      schedule={schedule}
      tasks={TASKS}
      deadline={6}
      active={null}
      onSelect={onSelect}
      onChangeTask={onChangeTask}
    />,
  );
  const bar = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
  return { onSelect, onChangeTask, bar };
}

describe("Timeline dragging", () => {
  it("hands a task to the person whose row it is dropped on", () => {
    const { onChangeTask, onSelect, bar } = setup();
    const stewards = bar("Find stewards");
    fireEvent.pointerDown(stewards, { clientX: 250, clientY: 160, button: 0 });
    fireEvent.pointerMove(stewards, { clientX: 252, clientY: 120 });
    expect(screen.getByRole("status")).toHaveTextContent('Give "Find stewards" to Ann');
    fireEvent.pointerUp(stewards, { clientX: 252, clientY: 120 });
    expect(onChangeTask).toHaveBeenCalledWith("T3", { owner: "Ann" });
    // The click a browser sends after the drag must not count as a click.
    fireEvent.click(stewards);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("changes how long a task takes when its end is dragged", () => {
    const { onChangeTask, bar } = setup();
    const handle = bar("Print posters").querySelector("[data-stretch]")!;
    fireEvent.pointerDown(handle, { clientX: 900, clientY: 120, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 700, clientY: 121 });
    expect(screen.getByRole("status")).toHaveTextContent('"Print posters": 2 days (was 4)');
    fireEvent.pointerUp(handle, { clientX: 700, clientY: 121 });
    expect(onChangeTask).toHaveBeenCalledWith("T2", { duration_days: 2 });
  });

  it("cancels on Escape, and on a drop outside the rows", () => {
    const { onChangeTask, bar } = setup();
    const stewards = bar("Find stewards");
    fireEvent.pointerDown(stewards, { clientX: 250, clientY: 160, button: 0 });
    fireEvent.pointerMove(stewards, { clientX: 250, clientY: 120 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.pointerUp(stewards, { clientX: 250, clientY: 120 });

    fireEvent.pointerDown(stewards, { clientX: 250, clientY: 160, button: 0 });
    fireEvent.pointerMove(stewards, { clientX: 250, clientY: 400 });
    expect(screen.getByRole("status")).toHaveTextContent("Let go here to cancel");
    fireEvent.pointerUp(stewards, { clientX: 250, clientY: 400 });
    expect(onChangeTask).not.toHaveBeenCalled();
  });

  it("still treats a click as a click", () => {
    const { onSelect, onChangeTask, bar } = setup();
    const stewards = bar("Find stewards");
    fireEvent.pointerDown(stewards, { clientX: 250, clientY: 160, button: 0 });
    fireEvent.pointerUp(stewards, { clientX: 251, clientY: 161 });
    fireEvent.click(stewards);
    expect(onSelect).toHaveBeenCalledWith("task:T3");
    expect(onChangeTask).not.toHaveBeenCalled();
  });
});
