"use client";

import type { Task } from "@/core/contracts";
import type { ScheduledResult } from "@/core/schedule/types";
import styles from "./plan.module.css";

type Props = {
  schedule: ScheduledResult;
  tasks: readonly Task[];
  deadline: number | null;
  active: string | null;
  onSelect: (id: string) => void;
};

/**
 * One row per person, bars by day. The tasks that set the end day are
 * marked; a dashed terracotta line marks the deadline.
 */
export function Timeline({ schedule, tasks, deadline, active, onSelect }: Props) {
  const entries = new Map(schedule.schedule.map((entry) => [entry.id, entry]));
  const critical = new Set(schedule.critical_path);
  const span = Math.max(schedule.end_day, deadline ?? 0, 1);
  const owners = [...new Set(tasks.map((task) => task.owner ?? ""))].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : 0,
  );
  const ticks = Array.from({ length: Math.floor(span / 7) + 1 }, (_, i) => i * 7);
  const pct = (day: number) => `${(100 * day) / span}%`;

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
      {owners.map((owner) => (
        <div key={owner || "none"} className={styles.timelineRow}>
          <span className={styles.timelineOwner}>{owner || "No owner"}</span>
          <div className={styles.track}>
            {tasks
              .filter((task) => (task.owner ?? "") === owner)
              .map((task) => {
                const entry = entries.get(task.id);
                if (!entry) return null;
                const late = deadline !== null && entry.end_day > deadline;
                const classes = [
                  styles.bar,
                  critical.has(task.id) ? styles.barCritical : "",
                  late ? styles.barLate : "",
                  active === `task:${task.id}` ? styles.barActive : "",
                ].join(" ");
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={classes}
                    style={{
                      left: pct(entry.start_day),
                      width: pct(entry.end_day - entry.start_day),
                    }}
                    title={`${task.name} · day ${entry.start_day} to ${entry.end_day}`}
                    aria-label={`${task.name}, ${owner || "no owner"}, day ${entry.start_day} to ${entry.end_day}${critical.has(task.id) ? ", sets the end day" : ""}`}
                    onClick={() => onSelect(`task:${task.id}`)}
                  >
                    <span>{task.name}</span>
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
      ))}
      <p className={styles.legend} aria-hidden="true">
        <span className={styles.legendCritical} /> Green tasks decide the finish date
        {deadline !== null && (
          <>
            <span className={styles.legendDeadline} /> Dashed line: the deadline, day {deadline}
          </>
        )}
      </p>
    </div>
  );
}
