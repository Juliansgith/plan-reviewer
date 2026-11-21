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
  { severity: "blocker", title: "Must be fixed before you approve" },
  { severity: "warning", title: "Should be fixed or checked" },
  { severity: "note", title: "Small points" },
];

const countText = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
        className={`${styles.finding} ${finding.severity === "blocker" ? styles.findingBlocker : ""} ${active === id ? styles.findingActive : ""}`}
      >
        <div className={styles.findingHead}>
          <h4 className={styles.findingTitle}>{finding.title}</h4>
          {finding.severity === "blocker" && <Chip tone="bad">Must fix</Chip>}
        </div>
        <p className={styles.findingDetail}>{finding.detail}</p>
        {finding.quote && (
          <div className={styles.quoteBox}>
            <p className={styles.quoteLabel}>The plan says:</p>
            <blockquote className={styles.quote}>“{finding.quote}”</blockquote>
            {spans[index] && (
              <button type="button" className={styles.secondary} onClick={() => onShow(id)}>
                <Icon name="locate" size={18} />
                See this in the plan
              </button>
            )}
          </div>
        )}
        {(finding.source === "code" || finding.quote_removed || stale) && (
          <p className={styles.findingMeta}>
            {finding.source === "code" && "Checked automatically."}
            {finding.quote_removed &&
              " The quote could not be found in the plan, so it is not shown."}
            {stale && " This was worked out before your changes."}
          </p>
        )}
      </li>
    );
  };

  return (
    <section aria-label="What needs fixing" className={styles.section}>
      <h2 className={styles.sectionTitle}>What needs fixing</h2>
      <p className={styles.sectionIntro}>
        {findings.length === 0
          ? "Nothing needs fixing."
          : `${countText(counts[0]!, "thing must", "things must")} be fixed, ${countText(counts[1]!, "thing", "things")} should be, and ${countText(counts[2]!, "small point", "small points")}.`}
      </p>
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
          <summary className={styles.groupSummary}>
            {GROUPS[2]!.title} ({counts[2]})
          </summary>
          <ul className={styles.findings}>
            {indexed.filter((f) => f.finding.severity === "note").map(card)}
          </ul>
        </details>
      )}
      <div className={styles.reply}>
        <button type="button" className={styles.primary} onClick={props.onCopyReply}>
          <Icon name="copy" size={18} />
          Copy a reply to the committee
        </button>
        <span aria-live="polite" className={styles.copied}>
          {props.copyState === "copied" ? "Copied" : ""}
        </span>
      </div>
      <p className={styles.hintSmall}>
        The reply lists what must and should be fixed, quoting the committee&apos;s own words.
      </p>
      {props.copyState === "failed" && (
        <label className={styles.replyFallback}>
          Copying is blocked in this browser. Select the text below and copy it:
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
