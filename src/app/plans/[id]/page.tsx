import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/components/Icon";
import { PlainPlanDocument } from "@/components/plan/PlanDocument";
import { PlanWorkspace } from "@/components/plan/PlanWorkspace";
import { plans } from "@/server/data";
import type { PlanView } from "@/server/plans";
import { formatStamp, plural } from "@/ui/format";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const plan = plans.get((await params).id);
  return { title: plan ? `${plan.title} · Plan reviewer` : "Plan not found · Plan reviewer" };
}

function ReviewProblems({ view }: { view: PlanView }) {
  const notReviewed = view.verdict.status === "not_reviewed";
  return (
    <section
      className={`${styles.problem} ${notReviewed ? styles.neutral : ""}`}
      aria-label="Review status"
    >
      <p className={styles.label}>{notReviewed ? "Not reviewed" : "Review not shown"}</p>
      <h2>
        {notReviewed
          ? "This plan has not been reviewed yet"
          : "The stored review failed its checks"}
      </h2>
      {!notReviewed && (
        <>
          <p>It is not shown, because these problems mean it cannot be trusted:</p>
          <ul>
            {view.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </>
      )}
      <p>
        Create a review with{" "}
        <code>
          ./review data/plans/{view.id}.md data/reviews/{view.id}.json
        </code>
        .
      </p>
    </section>
  );
}

export default async function PlanPage({ params }: Props) {
  const view = plans.get((await params).id);
  if (!view) notFound();

  const meta = view.review
    ? [
        plural(view.review.tasks.length, "task"),
        view.review.meta
          ? `reviewed ${formatStamp(view.review.meta.generated_at)} by ${view.review.meta.model}`
          : "reviewed elsewhere",
      ].join(" · ")
    : view.verdict.status === "review_invalid"
      ? "The stored review failed its checks"
      : "Not reviewed";

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <Link href="/">
            <Icon name="back" />
            Event plans
          </Link>
        </nav>
        <h1>{view.title}</h1>
        <p className={styles.meta}>{meta}</p>
        {view.review && view.schedule ? (
          <PlanWorkspace view={view} />
        ) : (
          <>
            <ReviewProblems view={view} />
            <section className={styles.document} aria-label="The plan">
              <p className={styles.label}>The plan</p>
              <PlainPlanDocument text={view.text} />
            </section>
          </>
        )}
      </main>
    </>
  );
}
