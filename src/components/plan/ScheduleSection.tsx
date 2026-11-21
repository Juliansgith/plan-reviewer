"use client";

import type { ScheduleResult } from "@/core/schedule/types";
import type { Draft } from "@/ui/corrections";
import { fieldId } from "@/ui/fixes";
import { Icon } from "../Icon";
import { TaskTable } from "./TaskTable";
import { Timeline, type TaskPatch } from "./Timeline";
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

/** The section heading's id, so a remark can bring Nora here. */
export const SCHEDULE_TITLE_ID = "schedule-title";

/** Who does what and when, with the switch into changing tasks. */
export function ScheduleSection(props: Props) {
  const { draft, schedule, editing, active } = props;
  const cycleIds = new Set(schedule.status === "cycle" ? schedule.cycle_groups.flat() : []);
  const changeTask = (id: string, patch: TaskPatch) =>
    props.onChange({
      deadline_day: draft.deadline_day,
      tasks: draft.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    });

  return (
    <section aria-label="Schedule" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id={SCHEDULE_TITLE_ID} tabIndex={-1} className={styles.sectionTitle}>
          Who does what, and when
        </h2>
        <button
          type="button"
          className={editing ? styles.secondary : styles.primary}
          aria-pressed={editing}
          onClick={props.onToggleEditing}
        >
          <Icon name={editing ? "check" : "edit"} size={18} />
          {editing ? "Done" : "Change tasks"}
        </button>
      </div>
      <p className={styles.sectionIntro}>
        {editing
          ? "Change who does a task, how many days it takes, or what it waits for. The dates update as you type."
          : "To try a change, drag a task to another person, or drag its end to make it longer or shorter. To change anything else, use Change tasks."}
      </p>
      {editing && (
        <label className={styles.deadlineEdit}>
          Deadline (day)
          <input
            id={fieldId.deadline}
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
      {schedule.status === "scheduled" ? (
        <Timeline
          schedule={schedule}
          tasks={draft.tasks}
          deadline={draft.deadline_day}
          active={active}
          onSelect={props.onSelect}
          onChangeTask={changeTask}
        />
      ) : (
        <p className={styles.blocked}>
          <Icon name="alert" size={20} />
          No dates can be worked out, because some tasks wait for each other. They are marked in the
          table below. Change one of them to see the dates.
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
