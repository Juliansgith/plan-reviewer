"use client";

import type { FixAction, FixHelp } from "@/ui/fixes";
import { Icon } from "../Icon";
import styles from "./FixBox.module.css";
import plan from "./plan.module.css";

/** Under a remark: what Nora can do about it, or that her changes sorted it out. */
export function FixBox({ help, onFix }: { help: FixHelp; onFix: (action: FixAction) => void }) {
  if (help.sorted) {
    return (
      <div className={styles.sorted}>
        <p className={styles.title}>
          <Icon name="ok" size={20} />
          Sorted by your changes
        </p>
        <p className={styles.text}>{help.sorted}</p>
      </div>
    );
  }
  if (!help.advice && !help.actions.length) return null;
  return (
    <div className={styles.todo}>
      <p className={styles.title}>
        <Icon name="next" size={20} />
        What you can do
      </p>
      {help.advice && <p className={styles.text}>{help.advice}</p>}
      {help.actions.length > 0 && (
        <div className={styles.buttons}>
          {help.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={plan.secondary}
              onClick={() => onFix(action)}
            >
              {action.kind === "edit" && <Icon name="edit" size={18} />}
              {action.kind === "timeline" && <Icon name="locate" size={18} />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
