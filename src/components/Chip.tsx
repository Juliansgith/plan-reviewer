import type { ReactNode } from "react";
import styles from "./Chip.module.css";

export type ChipTone = "good" | "bad" | "neutral";

/** A soft round label. Terracotta only for something late, wrong or at risk. */
export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return <span className={`${styles.chip} ${styles[tone]}`}>{children}</span>;
}
