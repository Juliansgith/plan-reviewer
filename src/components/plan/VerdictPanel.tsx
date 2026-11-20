"use client";

import type { VerdictCopy } from "@/ui/verdict";
import { Icon } from "../Icon";
import styles from "./plan.module.css";

type Props = {
  verdict: VerdictCopy;
  /** The review's own verdict, shown when corrections change it. */
  reviewVerdict: VerdictCopy | null;
  canShowDeadline: boolean;
  onShowDeadline: () => void;
  pending: boolean;
};

export function VerdictPanel({
  verdict,
  reviewVerdict,
  canShowDeadline,
  onShowDeadline,
  pending,
}: Props) {
  return (
    <section
      aria-label="Verdict"
      className={`${styles.card} ${styles.verdict} ${styles[`tone_${verdict.tone}`]}`}
    >
      <p className={styles.label}>{reviewVerdict ? "Verdict with your corrections" : "Verdict"}</p>
      <h2 className={styles.headline}>{verdict.headline}</h2>
      <p className={styles.sentence}>{verdict.sentence}</p>
      {verdict.reason && <p className={styles.reason}>{verdict.reason}</p>}
      <div className={styles.verdictFoot}>
        {verdict.proof && (
          <span className={styles.proof}>
            <Icon name="check" />
            {verdict.proof}
          </span>
        )}
        {canShowDeadline && (
          <button type="button" className={styles.quiet} onClick={onShowDeadline}>
            <Icon name="locate" />
            Where the plan states the deadline
          </button>
        )}
      </div>
      {reviewVerdict && (
        <p className={styles.was}>The review alone says: {reviewVerdict.headline.toLowerCase()}.</p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {pending ? "Working out the new schedule." : ""}
      </p>
    </section>
  );
}
