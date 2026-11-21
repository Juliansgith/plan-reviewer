import Link from "next/link";
import type { PlanSummary, Verdict } from "@/server/plans";
import { plural } from "@/ui/format";
import { days, spareText } from "@/ui/verdict";
import { Chip, type ChipTone } from "./Chip";
import { Icon } from "./Icon";
import styles from "./PlanList.module.css";

function statusOf(verdict: Verdict): { tone: ChipTone; text: string } {
  switch (verdict.status) {
    case "on_time":
      return {
        tone: "good",
        text: `On time, ${spareText((verdict.deadline_day ?? 0) - (verdict.end_day ?? 0))}`,
      };
    case "late":
      return { tone: "bad", text: `${days(verdict.days_late ?? 0)} late` };
    case "cycle":
      return { tone: "bad", text: "Can't be scheduled" };
    case "no_deadline":
      return { tone: "neutral", text: "No clear deadline" };
    case "not_reviewed":
      return { tone: "neutral", text: "Not reviewed yet" };
    case "review_invalid":
      return { tone: "bad", text: "Review can't be shown" };
  }
}

function detailsOf(verdict: Verdict): string {
  if (verdict.status === "not_reviewed") return "No review has been made for this plan yet";
  if (verdict.status === "review_invalid") return "The saved review didn't pass its checks";
  if (verdict.status === "cycle")
    return `Some tasks wait for each other · ${plural(verdict.tasks, "task")}`;
  const parts: string[] = [];
  if (verdict.deadline_day !== null) parts.push(`Deadline: day ${verdict.deadline_day}`);
  if (verdict.end_day !== null) parts.push(`Earliest finish: day ${verdict.end_day}`);
  parts.push(plural(verdict.tasks, "task"));
  return parts.join(" · ");
}

function overview(plans: readonly PlanSummary[]): string {
  const count = (statuses: Verdict["status"][]) =>
    plans.filter((p) => statuses.includes(p.verdict.status)).length;
  const onTime = count(["on_time"]);
  const attention = count(["late", "cycle", "no_deadline", "review_invalid"]);
  const notReviewed = count(["not_reviewed"]);
  const parts: string[] = [];
  if (onTime) parts.push(`${onTime} on time`);
  if (attention) parts.push(`${attention} ${attention === 1 ? "needs" : "need"} attention`);
  if (notReviewed) parts.push(`${notReviewed} not reviewed`);
  return `${plural(plans.length, "plan")}${parts.length ? `: ${parts.join(", ")}` : ""}.`;
}

export function PlanList({ plans }: { plans: readonly PlanSummary[] }) {
  return (
    <section aria-labelledby="plans-title">
      <h1 id="plans-title">Event plans</h1>
      <p className={styles.intro}>
        Each plan shows whether the work can be finished by its deadline. Open a plan to see why,
        and what needs fixing.
      </p>
      {plans.length === 0 ? (
        <p className={styles.empty}>
          No plans yet. Add a plan to the data/plans folder and review it with ./review.
        </p>
      ) : (
        <>
          <p className={styles.meta}>{overview(plans)}</p>
          <ul className={styles.list}>
            {plans.map((plan) => {
              const status = statusOf(plan.verdict);
              return (
                <li key={plan.id}>
                  <Link className={styles.row} href={`/plans/${plan.id}`}>
                    <span className={styles.text}>
                      <span className={styles.title}>{plan.title}</span>
                      <span className={styles.details}>{detailsOf(plan.verdict)}</span>
                    </span>
                    <Chip tone={status.tone}>{status.text}</Chip>
                    <span className={styles.open} aria-hidden="true">
                      Open
                      <Icon name="next" size={18} />
                    </span>
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
