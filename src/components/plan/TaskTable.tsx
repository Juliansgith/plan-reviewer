"use client";

import { useState } from "react";
import type { Task } from "@/core/contracts";
import type { ScheduleResult } from "@/core/schedule/types";
import { nextTaskId } from "@/ui/corrections";
import { Icon } from "../Icon";
import styles from "./plan.module.css";

type Props = {
  tasks: readonly Task[];
  schedule: ScheduleResult | null;
  editing: boolean;
  active: string | null;
  cycleIds: ReadonlySet<string>;
  hasQuote: (id: string) => boolean;
  onSelect: (id: string) => void;
  onChange: (tasks: Task[]) => void;
};

/** A number field that only reports whole numbers of at least 1. */
function DaysInput({ task, onCommit }: { task: Task; onCommit: (days: number) => void }) {
  const [text, setText] = useState(String(task.duration_days));
  const valid = /^\d+$/.test(text) && Number(text) >= 1;
  return (
    <input
      type="number"
      min={1}
      step={1}
      inputMode="numeric"
      className={styles.input}
      aria-label={`Days for ${task.name}`}
      aria-invalid={!valid}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const value = Number(event.target.value);
        if (/^\d+$/.test(event.target.value) && value >= 1) onCommit(value);
      }}
    />
  );
}

export function TaskTable({
  tasks,
  schedule,
  editing,
  active,
  cycleIds,
  hasQuote,
  onSelect,
  onChange,
}: Props) {
  const entries = new Map(
    schedule?.status === "scheduled" ? schedule.schedule.map((e) => [e.id, e]) : [],
  );
  const names = new Map(tasks.map((task) => [task.id, task.name]));
  const owners = [...new Set(tasks.map((task) => task.owner).filter((o): o is string => !!o))];

  const update = (id: string, patch: Partial<Task>) =>
    onChange(tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  const remove = (id: string) =>
    onChange(
      tasks
        .filter((task) => task.id !== id)
        .map((task) => ({ ...task, depends_on: task.depends_on.filter((d) => d !== id) })),
    );
  const add = () =>
    onChange([
      ...tasks,
      { id: nextTaskId(tasks), name: "New task", owner: null, duration_days: 1, depends_on: [] },
    ]);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.tasks}>
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Who</th>
            <th scope="col" className={styles.num}>
              Days
            </th>
            <th scope="col">Waits for</th>
            <th scope="col" className={styles.num}>
              Start
            </th>
            <th scope="col" className={styles.num}>
              End
            </th>
            {editing && (
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const entry = entries.get(task.id);
            const rowClass = [
              active === `task:${task.id}` ? styles.rowActive : "",
              cycleIds.has(task.id) ? styles.rowCycle : "",
            ].join(" ");
            return (
              <tr key={task.id} className={rowClass}>
                <td>
                  {editing ? (
                    <input
                      className={styles.input}
                      aria-label={`Name of ${task.name}`}
                      value={task.name}
                      onChange={(e) => update(task.id, { name: e.target.value })}
                    />
                  ) : hasQuote(task.id) ? (
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => onSelect(`task:${task.id}`)}
                    >
                      {task.name}
                    </button>
                  ) : (
                    task.name
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      className={styles.input}
                      aria-label={`Owner of ${task.name}`}
                      list="owners"
                      value={task.owner ?? ""}
                      placeholder="Nobody"
                      onChange={(e) =>
                        update(task.id, { owner: e.target.value.trim() ? e.target.value : null })
                      }
                    />
                  ) : (
                    (task.owner ?? <span className={styles.muted}>Nobody</span>)
                  )}
                </td>
                <td className={styles.num}>
                  {editing ? (
                    <DaysInput
                      task={task}
                      onCommit={(days) => update(task.id, { duration_days: days })}
                    />
                  ) : (
                    task.duration_days
                  )}
                </td>
                <td>
                  {editing ? (
                    <details className={styles.waits}>
                      <summary aria-label={`What ${task.name} waits for`}>
                        {task.depends_on.length
                          ? task.depends_on.map((d) => names.get(d) ?? d).join(", ")
                          : "Nothing"}
                      </summary>
                      <fieldset>
                        <legend className="visually-hidden">{task.name} waits for</legend>
                        {tasks
                          .filter((other) => other.id !== task.id)
                          .map((other) => (
                            <label key={other.id} className={styles.check}>
                              <input
                                type="checkbox"
                                checked={task.depends_on.includes(other.id)}
                                onChange={(e) =>
                                  update(task.id, {
                                    depends_on: e.target.checked
                                      ? [...task.depends_on, other.id]
                                      : task.depends_on.filter((d) => d !== other.id),
                                  })
                                }
                              />
                              {other.name}
                            </label>
                          ))}
                      </fieldset>
                    </details>
                  ) : task.depends_on.length ? (
                    task.depends_on.map((d) => names.get(d) ?? d).join(", ")
                  ) : (
                    <span className={styles.muted}>Nothing</span>
                  )}
                </td>
                <td className={styles.num}>{entry?.start_day ?? "–"}</td>
                <td className={styles.num}>{entry?.end_day ?? "–"}</td>
                {editing && (
                  <td>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Remove ${task.name}`}
                      onClick={() => remove(task.id)}
                    >
                      <Icon name="close" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {editing && (
        <>
          <datalist id="owners">
            {owners.map((owner) => (
              <option key={owner} value={owner} />
            ))}
          </datalist>
          <button type="button" className={styles.quiet} onClick={add}>
            <Icon name="plus" />
            Add a task
          </button>
        </>
      )}
    </div>
  );
}
