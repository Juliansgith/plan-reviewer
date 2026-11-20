"use client";

import type { ScheduleResult } from "@/core/schedule/types";
import type { Draft } from "@/ui/corrections";
import { Icon } from "../Icon";
import { TaskTable } from "./TaskTable";
import { Timeline } from "./Timeline";
import styles from "./plan.module.css";

type Props = {
  draft: Draft;
  schedule: ScheduleResult;
  editing: boolean;
  active: string | null;
  hasQuote: (taskId: string) => boolean;
  onToggleEditing: () => void;
  onSelect: (id: string) => void;
  onChange: (draft: Draft) => void;
};

/** The timeline by person and the task table, with the switch into correcting. */
export function ScheduleSection(props: Props) {
  const { draft, schedule, editing, active } = props;
  const cycleIds = new Set(schedule.status === "cycle" ? schedule.cycle_groups.flat() : []);

  return (
    <section aria-label="Schedule" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.label}>Schedule</h2>
        <div className={styles.headActions}>
          {editing && (
            <label className={styles.deadlineEdit}>
              Deadline day
              <input
                type="number"
                min={0}
                className={styles.input}
                value={draft.deadline_day ?? ""}
                placeholder="none"
                onChange={(e) => {
                  const value = e.target.value === "" ? null : Number(e.target.value);
                  if (value === null || (Number.isInteger(value) && value >= 0)) {
                    props.onChange({ tasks: draft.tasks, deadline_day: value });
                  }
                }}
              />
            </label>
          )}
          <button
            type="button"
            className={editing ? styles.quiet : styles.action}
            aria-pressed={editing}
            onClick={props.onToggleEditing}
          >
            <Icon name="edit" />
            {editing ? "Done correcting" : "Correct the review"}
          </button>
        </div>
      </div>
      {schedule.status === "scheduled" ? (
        <Timeline
          schedule={schedule}
          tasks={draft.tasks}
          deadline={draft.deadline_day}
          active={active}
          onSelect={props.onSelect}
        />
      ) : (
        <p className={styles.blocked}>
          No schedule: some tasks wait on each other in a circle. They are marked in the table.
          Correct one of them to see a schedule.
        </p>
      )}
      <TaskTable
        tasks={draft.tasks}
        schedule={schedule}
        editing={editing}
        active={active}
        cycleIds={cycleIds}
        hasQuote={props.hasQuote}
        onSelect={props.onSelect}
        onChange={(tasks) => props.onChange({ deadline_day: draft.deadline_day, tasks })}
      />
    </section>
  );
}
