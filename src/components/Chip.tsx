import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Chip.module.css";

export type ChipTone = "good" | "bad" | "neutral";

const ICONS = { good: "ok", bad: "alert", neutral: "info" } as const;

/**
 * A status in words with an icon, so it never depends on colour alone.
 * Terracotta only for something late, wrong or at risk.
 */
export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`${styles.chip} ${styles[tone]}`}>
      <Icon name={ICONS[tone]} size={18} />
      <span>{children}</span>
    </span>
  );
}
