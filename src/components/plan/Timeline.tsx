"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Task } from "@/core/contracts";
import type { ScheduledResult } from "@/core/schedule/types";
import { dragTip, hasMoved, rowAt, stretchedDays, type RowBox } from "@/ui/timeline-drag";
import styles from "./Timeline.module.css";

export type TaskPatch = Partial<Pick<Task, "owner" | "duration_days">>;

type Props = {
  schedule: ScheduledResult;
  tasks: readonly Task[];
  deadline: number | null;
  active: string | null;
  onSelect: (id: string) => void;
  /** When set, a bar can be dragged to another person, or stretched by its end. */
  onChangeTask?: (id: string, patch: TaskPatch) => void;
};

type Drag = { id: string; x: number; y: number } & (
  { mode: "move"; dy: number; to: string | null | undefined } | { mode: "stretch"; days: number }
);

/**
 * One row per person, bars by day. The tasks that set the end day are
 * marked; a dashed terracotta line marks the deadline. Start days come from
 * the scheduler, so a bar moves only between people (who does it) and
 * stretches (how long it takes). The task table below does the same by
 * keyboard.
 */
export function Timeline({ schedule, tasks, deadline, active, onSelect, onChangeTask }: Props) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const tracks = useRef(new Map<string, HTMLDivElement>());
  const swallowClick = useRef(false);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const entries = new Map(schedule.schedule.map((entry) => [entry.id, entry]));
  const critical = new Set(schedule.critical_path);
  const span = Math.max(schedule.end_day, deadline ?? 0, 1);
  const owners = [...new Set(tasks.map((task) => task.owner ?? ""))].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : 0,
  );
  const ticks = Array.from({ length: Math.floor(span / 7) + 1 }, (_, i) => i * 7);
  const pct = (day: number) => `${(100 * day) / span}%`;
  const dragged = drag ? tasks.find((task) => task.id === drag.id) : undefined;

  function begin(event: ReactPointerEvent<HTMLButtonElement>, task: Task) {
    swallowClick.current = false;
    if (!onChangeTask || event.button !== 0) return;
    const change = onChangeTask;
    const stretch = !!(event.target as Element).closest("[data-stretch]");
    // Each row reaches down to the next, so the gaps between rows count too.
    const rows: RowBox[] = owners.map((key) => {
      const box = tracks.current.get(key)!.getBoundingClientRect();
      return { owner: key || null, top: box.top, bottom: box.bottom };
    });
    rows.forEach((row, i) => (row.bottom = rows[i + 1]?.top ?? row.bottom));
    const width = tracks.current.get(task.owner ?? "")?.getBoundingClientRect().width ?? 0;
    const start = { x: event.clientX, y: event.clientY };
    let current: Drag | null = null;

    const move = (e: PointerEvent) => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!current && !hasMoved(dx, dy)) return;
      const where = { id: task.id, x: e.clientX, y: e.clientY };
      if (stretch) {
        current = {
          ...where,
          mode: "stretch",
          days: stretchedDays(task.duration_days, dx, width / span),
        };
      } else {
        const row = rowAt(e.clientY, rows);
        current = { ...where, mode: "move", dy, to: row ? row.owner : undefined };
      }
      setDrag(current);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
      stopDrag.current = null;
      if (current) {
        // The browser sends a click after the drag; it is not a click.
        swallowClick.current = true;
        setTimeout(() => (swallowClick.current = false), 0);
        if (
          commit &&
          current.mode === "move" &&
          current.to !== undefined &&
          current.to !== task.owner
        )
          change(task.id, { owner: current.to });
        if (commit && current.mode === "stretch" && current.days !== task.duration_days)
          change(task.id, { duration_days: current.days });
      }
      current = null;
      setDrag(null);
    };
    const drop = () => finish(true);
    const cancel = () => finish(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && finish(false);

    stopDrag.current?.();
    stopDrag.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
  }

  return (
    <div
      className={styles.timeline}
      role="group"
      aria-label={`Schedule by person, from day 0 to day ${schedule.end_day}${deadline === null ? "" : `; deadline day ${deadline}`}`}
    >
      <div className={styles.timelineAxis} aria-hidden="true">
        <span className={styles.axisLabel}>Day</span>
        <div className={styles.track}>
          {ticks.map((day) => (
            <span key={day} className={styles.tick} style={{ left: pct(day) }}>
              {day}
            </span>
          ))}
        </div>
      </div>
      {owners.map((owner, row) => {
        const target =
          drag?.mode === "move" &&
          drag.to !== undefined &&
          (drag.to ?? "") === owner &&
          drag.to !== dragged?.owner;
        return (
          <div
            key={owner || "none"}
            className={`${styles.timelineRow} ${target ? styles.rowTarget : ""}`}
          >
            <span className={styles.timelineOwner}>{owner || "No owner"}</span>
            <div
              className={styles.track}
              data-row={row}
              ref={(element) => {
                if (element) tracks.current.set(owner, element);
                else tracks.current.delete(owner);
              }}
            >
              {tasks
                .filter((task) => (task.owner ?? "") === owner)
                .map((task) => {
                  const entry = entries.get(task.id);
                  if (!entry) return null;
                  const moving = drag?.id === task.id ? drag : null;
                  const days =
                    moving?.mode === "stretch" ? moving.days : entry.end_day - entry.start_day;
                  const late = deadline !== null && entry.end_day > deadline;
                  const classes = [
                    styles.bar,
                    critical.has(task.id) ? styles.barCritical : "",
                    late ? styles.barLate : "",
                    active === `task:${task.id}` ? styles.barActive : "",
                    onChangeTask ? styles.draggable : "",
                    moving ? styles.dragging : "",
                  ].join(" ");
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={classes}
                      style={{
                        left: pct(entry.start_day),
                        width: pct(days),
                        transform:
                          moving?.mode === "move" ? `translateY(${moving.dy}px)` : undefined,
                      }}
                      title={`${task.name} · day ${entry.start_day} to ${entry.end_day}`}
                      aria-label={`${task.name}, ${owner || "no owner"}, day ${entry.start_day} to ${entry.end_day}${critical.has(task.id) ? ", sets the end day" : ""}`}
                      onPointerDown={(event) => begin(event, task)}
                      onClick={() => {
                        if (swallowClick.current) swallowClick.current = false;
                        else onSelect(`task:${task.id}`);
                      }}
                    >
                      <span>{task.name}</span>
                      {onChangeTask && (
                        <span data-stretch="" className={styles.stretch} aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              {deadline !== null && (
                <span
                  className={styles.deadlineLine}
                  style={{ left: pct(deadline) }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        );
      })}
      <p className={styles.legend} aria-hidden="true">
        <span className={styles.legendCritical} /> Green tasks decide the finish date
        {deadline !== null && (
          <>
            <span className={styles.legendDeadline} /> Dashed line: the deadline, day {deadline}
          </>
        )}
      </p>
      {drag && dragged && (
        <p role="status" className={styles.dragTip} style={{ left: drag.x + 16, top: drag.y + 16 }}>
          {dragTip(
            drag.mode === "move"
              ? { mode: "move", name: dragged.name, from: dragged.owner, to: drag.to }
              : { mode: "stretch", name: dragged.name, from: dragged.duration_days, to: drag.days },
          )}
        </p>
      )}
    </div>
  );
}
