"use client";

import type { ReviewFinding, Severity } from "@/core/review/types";
import type { Span } from "@/core/text";
import { Chip } from "../Chip";
import { Icon } from "../Icon";
import styles from "./plan.module.css";

type Props = {
  findings: readonly ReviewFinding[];
  spans: readonly (Span | null)[];
  active: string | null;
  corrected: boolean;
  onShow: (id: string) => void;
  onCopyReply: () => void;
  copyState: "idle" | "copied" | "failed";
  replyText: string;
};

const GROUPS: { severity: Severity; title: string }[] = [
  { severity: "blocker", title: "Must change before sign-off" },
  { severity: "warning", title: "Should be fixed or clarified" },
  { severity: "note", title: "Minor notes" },
];

export function FindingList(props: Props) {
  const { findings, spans, active, corrected, onShow } = props;
  const indexed = findings.map((finding, index) => ({ finding, index }));
  const counts = GROUPS.map(
    ({ severity }) => indexed.filter((f) => f.finding.severity === severity).length,
  );

  const card = ({ finding, index }: { finding: ReviewFinding; index: number }) => {
    const id = `finding:${index}`;
    const stale = corrected && (finding.kind === "late" || finding.kind === "cycle");
    return (
      <li
        key={id}
        id={`finding-${index}`}
        className={`${styles.finding} ${active === id ? styles.findingActive : ""}`}
      >
        <div className={styles.findingHead}>
          <span className={styles.findingTitle}>{finding.title}</span>
          {finding.severity === "blocker" && <Chip tone="bad">Must change</Chip>}
        </div>
        <p className={styles.findingDetail}>{finding.detail}</p>
        {finding.quote && (
          <blockquote className={styles.quote}>
            <span>“{finding.quote}”</span>
            {spans[index] && (
              <button type="button" className={styles.quiet} onClick={() => onShow(id)}>
                <Icon name="locate" />
                Show in plan
              </button>
            )}
          </blockquote>
        )}
        <p className={styles.findingMeta}>
          {finding.source === "code" ? "Checked by code" : "From the model's review"}
          {finding.quote_removed && " · The model's quote was not in the plan, so it was removed"}
          {stale && " · Based on the review, before your corrections"}
        </p>
      </li>
    );
  };

  return (
    <section aria-label="What is wrong" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.label}>What is wrong</h2>
        <span className={styles.sectionMeta}>
          {counts[0]} must change · {counts[1]} should be fixed · {counts[2]} minor
        </span>
      </div>
      {findings.length === 0 && <p className={styles.muted}>Nothing to report.</p>}
      {GROUPS.slice(0, 2).map(({ severity, title }) => {
        const items = indexed.filter((f) => f.finding.severity === severity);
        if (!items.length) return null;
        return (
          <div key={severity} className={styles.group}>
            <h3 className={styles.groupTitle}>{title}</h3>
            <ul className={styles.findings}>{items.map(card)}</ul>
          </div>
        );
      })}
      {counts[2]! > 0 && (
        <details className={styles.group}>
          <summary className={styles.groupTitle}>
            {GROUPS[2]!.title} ({counts[2]})
          </summary>
          <ul className={styles.findings}>
            {indexed.filter((f) => f.finding.severity === "note").map(card)}
          </ul>
        </details>
      )}
      <div className={styles.reply}>
        <button type="button" className={styles.action} onClick={props.onCopyReply}>
          <Icon name="copy" />
          Copy a reply for the committee
        </button>
        <span aria-live="polite" className={styles.sectionMeta}>
          {props.copyState === "copied" ? "Copied" : ""}
        </span>
      </div>
      {props.copyState === "failed" && (
        <label className={styles.replyFallback}>
          Copying is blocked in this browser. Select the text and copy it:
          <textarea
            readOnly
            value={props.replyText}
            rows={10}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}
