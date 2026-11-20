import Link from "next/link";
import type { PlanSummary, Verdict } from "@/server/plans";
import { plural } from "@/ui/format";
import { days, spareText } from "@/ui/verdict";
import { Chip, type ChipTone } from "./Chip";
import styles from "./PlanList.module.css";

function chipFor(verdict: Verdict): { tone: ChipTone; text: string } {
  switch (verdict.status) {
    case "on_time": {
      const spare = (verdict.deadline_day ?? 0) - (verdict.end_day ?? 0);
      return {
        tone: "good",
        text: spare > 0 ? `On time, ${spareText(spare)}` : "On time, with no days to spare",
      };
    }
    case "late":
      return { tone: "bad", text: `${days(verdict.days_late ?? 0)} late` };
    case "cycle":
      return { tone: "bad", text: "Blocked: tasks wait on each other" };
    case "no_deadline":
      return { tone: "neutral", text: "No clear deadline" };
    case "not_reviewed":
      return { tone: "neutral", text: "Not reviewed yet" };
    case "review_invalid":
      return { tone: "bad", text: "Review failed its checks" };
  }
}

function metaFor(verdict: Verdict): string {
  if (verdict.status === "not_reviewed") return "Run ./review to review this plan";
  if (verdict.status === "review_invalid")
    return "The stored review is not shown; open the plan for details";
  const parts = [plural(verdict.tasks, "task")];
  parts.push(
    verdict.deadline_day === null ? "no clear deadline" : `deadline day ${verdict.deadline_day}`,
  );
  if (verdict.blockers) parts.push(plural(verdict.blockers, "blocker"));
  return parts.join(" · ");
}

function overview(plans: readonly PlanSummary[]): string {
  const count = (statuses: Verdict["status"][]) =>
    plans.filter((p) => statuses.includes(p.verdict.status)).length;
  const onTime = count(["on_time"]);
  const attention = count(["late", "cycle", "no_deadline", "review_invalid"]);
  const notReviewed = count(["not_reviewed"]);
  const parts = [plural(plans.length, "plan")];
  if (onTime) parts.push(`${onTime} on time`);
  if (attention) parts.push(`${attention} ${attention === 1 ? "needs" : "need"} attention`);
  if (notReviewed) parts.push(`${notReviewed} not reviewed`);
  return parts.join(" · ");
}

export function PlanList({ plans }: { plans: readonly PlanSummary[] }) {
  return (
    <section aria-labelledby="plans-title">
      <h1 id="plans-title">Event plans</h1>
      {plans.length === 0 ? (
        <p className={styles.empty}>
          No plans yet. Add a markdown file to data/plans and review it with ./review.
        </p>
      ) : (
        <>
          <p className={styles.meta}>{overview(plans)}</p>
          <ul className={styles.list}>
            {plans.map((plan) => {
              const chip = chipFor(plan.verdict);
              const { end_day } = plan.verdict;
              return (
                <li key={plan.id}>
                  <Link className={styles.row} href={`/plans/${plan.id}`}>
                    <span className={styles.text}>
                      <span className={styles.title}>{plan.title}</span>
                      <span className={styles.rowMeta}>{metaFor(plan.verdict)}</span>
                    </span>
                    {end_day !== null && (
                      <span className={styles.figure}>
                        <span className={styles.figureMain}>Day {end_day}</span>
                        <span className={styles.figureSub}>earliest finish</span>
                      </span>
                    )}
                    <Chip tone={chip.tone}>{chip.text}</Chip>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
