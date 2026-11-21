"use client";

import { describeChange, type Change } from "@/ui/corrections";
import { formatStamp } from "@/ui/format";
import { Icon } from "../Icon";
import styles from "./plan.module.css";

type Props = {
  changes: readonly Change[];
  savedAt: string | null;
  pending: boolean;
  /** What the changes did to the finish day, once the new dates are back. */
  outcome: string | null;
  problems: readonly string[];
  onDiscard: () => void;
};

/** Nora's changes in plain words, what they do, and a way back. */
export function CorrectionsPanel({
  changes,
  savedAt,
  pending,
  outcome,
  problems,
  onDiscard,
}: Props) {
  return (
    <section aria-label="Your changes" className={styles.changes}>
      <h2 className={styles.sectionTitle}>Your changes</h2>
      {pending && <p className={styles.sectionIntro}>Working out the new dates…</p>}
      {outcome && !problems.length && <p className={styles.outcome}>{outcome}</p>}
      {problems.length > 0 && (
        <ul className={styles.problems}>
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <ul className={styles.changeList}>
        {changes.map((change, i) => (
          <li key={i}>{describeChange(change)}</li>
        ))}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onDiscard}>
          <Icon name="undo" size={18} />
          Undo all changes
        </button>
        {savedAt && (
          <span className={styles.hintSmall}>Saved on this computer, {formatStamp(savedAt)}</span>
        )}
      </div>
    </section>
  );
}
