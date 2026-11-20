"use client";

import { describeChange, type Change } from "@/ui/corrections";
import { formatStamp } from "@/ui/format";
import { Icon } from "../Icon";
import styles from "./plan.module.css";

type Props = {
  changes: readonly Change[];
  savedAt: string | null;
  pending: boolean;
  /** What the corrections did to the end day, once the schedule is back. */
  outcome: string | null;
  problems: readonly string[];
  onDiscard: () => void;
};

/** Nora's corrections in plain words, what they change, and a way back. */
export function CorrectionsPanel({
  changes,
  savedAt,
  pending,
  outcome,
  problems,
  onDiscard,
}: Props) {
  return (
    <section aria-label="Your corrections" className={`${styles.card} ${styles.changes}`}>
      <div className={styles.sectionHead}>
        <h2 className={styles.label}>Your corrections</h2>
        {savedAt && (
          <span className={styles.sectionMeta}>Saved in this browser, {formatStamp(savedAt)}</span>
        )}
      </div>
      {pending && <p className={styles.muted}>Working out the new schedule…</p>}
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
      <button type="button" className={styles.quiet} onClick={onDiscard}>
        <Icon name="undo" />
        Discard corrections
      </button>
    </section>
  );
}
