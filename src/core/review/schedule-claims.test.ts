import { describe, expect, it } from "vitest";
import { claimsScheduleVerdict } from "./schedule-claims";

describe("claimsScheduleVerdict", () => {
  // The first is a real model answer for the Spring Market (stored review of
  // 20 Nov 2026). It adds two tasks that run side by side; the plan ends on
  // day 18, with 3 days to spare.
  it.each([
    "Tight schedule against the deadline. The chain of tasks adds up to 20 days (booking 2, stallholders 10, floor plan 3, furniture 2, rota 3), leaving no slack before the 21-day deadline.",
    "Plan will miss the deadline. The work finishes after the deadline.",
    "The plan is 4 days late.",
    "Ruth's tasks total 52 days, so the festival cannot be ready in time.",
    "The critical path runs through the road closure.",
    "The timeline is tight for a committee of three.",
    "Only 2 days to spare.",
  ])("recognises a claim about the schedule: %j", (text) => {
    expect(claimsScheduleVerdict(text)).toBe(true);
  });

  // Real model findings from the stored reviews, and the test fixture's note.
  it.each([
    "Hall booking depends on go-ahead not in the plan. Joan will book the rooms only once the Council gives the go-ahead, but no task or date covers that approval. The whole schedule rests on it, and the office can hold the date only for a few days.",
    "Council approval time not confirmed. The plan does not say how long the council takes to approve the course, and the table allows one week. With the insurance and marshal recruitment both waiting on that approval, a delay would push the whole plan, so the council's turnaround should be confirmed.",
    "Durations estimated for note-only tasks. Durations of 3, 2, 8 and 3 days have been taken from the notes where stated and estimated where not; these should be confirmed.",
    "Ruth holds most of the critical tasks. This concentration is a single point of failure if she is unavailable.",
    "Durations are guesses. The committee says the durations are its best guess, so the schedule has little room for error.",
    "Pitch fees and float handling not scheduled. Martin will take pitch fees and Joan will sort out the float, but neither is a task with a duration.",
    "Stallholders who book late have no pitch.",
  ])("leaves other remarks alone: %j", (text) => {
    expect(claimsScheduleVerdict(text)).toBe(false);
  });
});
