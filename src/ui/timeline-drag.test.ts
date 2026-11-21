import { describe, expect, it } from "vitest";
import { dragTip, hasMoved, rowAt, stretchedDays } from "./timeline-drag";

describe("timeline dragging", () => {
  const rows = [
    { owner: "Ann", top: 100, bottom: 140 },
    { owner: "Bob", top: 140, bottom: 180 },
    { owner: null, top: 180, bottom: 220 },
  ];

  it("finds the person's row under the pointer, or none outside the rows", () => {
    expect(rowAt(120, rows)?.owner).toBe("Ann");
    expect(rowAt(140, rows)?.owner).toBe("Bob");
    expect(rowAt(219, rows)?.owner).toBeNull();
    expect(rowAt(99, rows)).toBeNull();
    expect(rowAt(220, rows)).toBeNull();
  });

  it("ignores a wobble, so a click is still a click", () => {
    expect(hasMoved(2, 3)).toBe(false);
    expect(hasMoved(0, 6)).toBe(true);
  });

  it("turns a stretch into whole days, never fewer than one", () => {
    expect(stretchedDays(4, 0, 50)).toBe(4);
    expect(stretchedDays(4, 76, 50)).toBe(6);
    expect(stretchedDays(4, -60, 50)).toBe(3);
    expect(stretchedDays(4, -1000, 50)).toBe(1);
    expect(stretchedDays(4, 30, 0)).toBe(4);
  });

  it("says what letting go will do", () => {
    expect(dragTip({ mode: "move", name: "Print posters", from: "Ann", to: "Bob" })).toBe(
      'Give "Print posters" to Bob',
    );
    expect(dragTip({ mode: "move", name: "Print posters", from: "Ann", to: null })).toBe(
      'Leave "Print posters" without an owner',
    );
    expect(dragTip({ mode: "move", name: "Print posters", from: "Ann", to: "Ann" })).toBe(
      'Drag "Print posters" to another person',
    );
    expect(dragTip({ mode: "move", name: "Print posters", from: "Ann", to: undefined })).toBe(
      "Let go here to cancel",
    );
    expect(dragTip({ mode: "stretch", name: "Print posters", from: 4, to: 2 })).toBe(
      '"Print posters": 2 days (was 4)',
    );
  });
});
