// The text Nora pastes into her reply when she sends a plan back. It quotes
// the committee's own words (every quote is verified against the plan) and
// leaves out minor notes, so the reply stays short.

import type { ReviewFinding } from "../core/review/types";

export function committeeSummary(input: {
  title: string;
  verdict: { headline: string; sentence: string; reason: string | null };
  findings: readonly ReviewFinding[];
}): string {
  const { title, verdict } = input;
  const lines = [
    title,
    "",
    [`${verdict.headline}.`, verdict.sentence, verdict.reason].filter(Boolean).join(" "),
  ];
  const important = input.findings.filter((f) => f.severity !== "note");
  if (important.length) {
    lines.push("", "Please address the following:", "");
    important.forEach((finding, i) => {
      const title = finding.title.replace(/[.!?]$/, "");
      lines.push(`${i + 1}. ${title}. ${finding.detail}`);
      if (finding.quote) lines.push(`   Your plan says: "${finding.quote}"`);
    });
  } else {
    lines.push("", "Nothing in the plan needs changing.");
  }
  return lines.join("\n");
}
