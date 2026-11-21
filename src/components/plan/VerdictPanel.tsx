"use client";

import type { VerdictCopy } from "@/ui/verdict";
import { Icon } from "../Icon";
import styles from "./plan.module.css";

type Props = {
  verdict: VerdictCopy;
  /** The review's own verdict, shown when changes alter it. */
  reviewVerdict: VerdictCopy | null;
  canShowDeadline: boolean;
  onShowDeadline: () => void;
  pending: boolean;
};

const ICONS = { good: "ok", bad: "alert", neutral: "info" } as const;

export function VerdictPanel({
  verdict,
  reviewVerdict,
  canShowDeadline,
  onShowDeadline,
  pending,
}: Props) {
  return (
    <section aria-label="Verdict" className={`${styles.verdict} ${styles[`tone_${verdict.tone}`]}`}>
      <p className={styles.eyebrow}>
        {reviewVerdict ? "With your changes" : "Can this plan be done by its deadline?"}
      </p>
      <h2 className={styles.headline}>
        <span className={styles.headlineIcon}>
          <Icon name={ICONS[verdict.tone]} size={30} />
        </span>
        {verdict.headline}
      </h2>
      <p className={styles.sentence}>{verdict.sentence}</p>
      {verdict.reason && (
        <p className={styles.reason}>
          {verdict.reasonLabel && <strong>{verdict.reasonLabel}: </strong>}
          {verdict.reason}
        </p>
      )}
      {verdict.proof && <p className={styles.proof}>{verdict.proof}</p>}
      <p className={styles.hint}>Days are counted from the committee&apos;s kickoff meeting.</p>
      {canShowDeadline && (
        <button type="button" className={styles.secondary} onClick={onShowDeadline}>
          <Icon name="locate" size={18} />
          Show where the plan gives the deadline
        </button>
      )}
      {reviewVerdict && (
        <p className={styles.was}>Without your changes: {reviewVerdict.headline.toLowerCase()}.</p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {pending ? "Working out the new dates." : ""}
      </p>
    </section>
  );
}
