// The arithmetic behind dragging in the timeline, kept apart from React so it
// can be tested. Start days are worked out by the scheduler, so a bar cannot
// be dragged to a day: it can be dragged to another person (who does it) or
// stretched (how many days it takes), the two things Nora knows better than
// the plan.

/** How far the pointer must move before a press becomes a drag, in pixels. */
export const DRAG_START_PX = 5;

export type RowBox = { owner: string | null; top: number; bottom: number };

export const hasMoved = (dx: number, dy: number) => Math.hypot(dx, dy) >= DRAG_START_PX;

export function rowAt<T extends RowBox>(y: number, rows: readonly T[]): T | null {
  return rows.find((row) => y >= row.top && y < row.bottom) ?? null;
}

export function stretchedDays(days: number, dx: number, pxPerDay: number): number {
  if (!(pxPerDay > 0)) return days;
  return Math.max(1, Math.round(days + dx / pxPerDay));
}

export type DragTip =
  /** to: the row under the pointer; undefined when it is outside every row. */
  | { mode: "move"; name: string; from: string | null; to: string | null | undefined }
  | { mode: "stretch"; name: string; from: number; to: number };

export function dragTip(tip: DragTip): string {
  const name = `"${tip.name}"`;
  if (tip.mode === "stretch")
    return `${name}: ${tip.to} day${tip.to === 1 ? "" : "s"} (was ${tip.from})`;
  if (tip.to === undefined) return "Let go here to cancel";
  if (tip.to === tip.from) return `Drag ${name} to another person`;
  return tip.to === null ? `Leave ${name} without an owner` : `Give ${name} to ${tip.to}`;
}
