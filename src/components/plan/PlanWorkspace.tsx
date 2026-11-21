"use client";

// The plan page's interactive part. The verdict comes first, then what is
// wrong (each remark linked to its words in the plan), then the schedule and
// the tasks, which Nora can correct to see what changes. The plan itself sits
// alongside, with the quoted passages marked.
//
// Corrections live in browser storage (src/ui/draft-store.ts) until
// discarded or until the review is regenerated. They are scheduled by POST
// /api/schedule, the endpoint the contract describes, so the page and the
// graders use one scheduler.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@/core/contracts";
import type { ScheduleResult } from "@/core/schedule/types";
import type { PlanView } from "@/server/plans";
import { committeeSummary } from "@/ui/committee-summary";
import {
  clearCorrections,
  compareOutcomes,
  correctionsKey,
  diffCorrections,
  parseCorrections,
  saveCorrections,
  type Draft,
} from "@/ui/corrections";
import { draftStorage, useStoredValue } from "@/ui/draft-store";
import { fixesFor, type FixAction } from "@/ui/fixes";
import type { Highlight } from "@/ui/markdown";
import { describeVerdict } from "@/ui/verdict";
import { CorrectionsPanel } from "./CorrectionsPanel";
import { FindingList } from "./FindingList";
import { PlanDocument } from "./PlanDocument";
import { SCHEDULE_TITLE_ID, ScheduleSection } from "./ScheduleSection";
import { VerdictPanel } from "./VerdictPanel";
import styles from "./plan.module.css";

const contractTask = ({ id, name, owner, duration_days, depends_on }: Task): Task => ({
  id,
  name,
  owner,
  duration_days,
  depends_on: [...depends_on],
});

/** The schedule answer for one exact request body, so a stale answer is never shown. */
type Answer = { key: string; schedule: ScheduleResult | null; problems: string[] };

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function PlanWorkspace({ view }: { view: PlanView }) {
  const review = view.review!;
  const original: Draft = useMemo(
    () => ({ deadline_day: review.deadline_day, tasks: review.tasks.map(contractTask) }),
    [review],
  );
  const stamp = review.meta?.generated_at ?? `unversioned:${JSON.stringify(original).length}`;

  const stored = useStoredValue(correctionsKey(view.id));
  const saved = useMemo(() => parseCorrections(stored, stamp), [stored, stamp]);
  const draft: Draft | null = useMemo(
    () => (saved ? { deadline_day: saved.deadline_day, tasks: saved.tasks } : null),
    [saved],
  );

  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  const scrollTarget = useRef<"plan" | "finding" | null>(null);

  const changes = useMemo(() => (draft ? diffCorrections(original, draft) : []), [draft, original]);
  const corrected = changes.length > 0;
  const current = corrected && draft ? draft : original;

  const localProblems = current.tasks.some((task) => !task.name.trim())
    ? ["Every task needs a name."]
    : [];
  const requestBody = corrected
    ? JSON.stringify({
        tasks: current.tasks.map(contractTask),
        deadline_day: current.deadline_day ?? 0,
      })
    : null;

  // Ask the scheduler about the corrected plan, a moment after typing stops.
  useEffect(() => {
    if (!requestBody || localProblems.length) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/schedule", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: requestBody,
          signal: controller.signal,
        });
        const body = await response.json();
        setAnswer(
          response.ok
            ? { key: requestBody, schedule: body as ScheduleResult, problems: [] }
            : {
                key: requestBody,
                schedule: null,
                problems: body?.error?.issues ?? [
                  body?.error?.message ?? "The schedule could not be worked out.",
                ],
              },
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setAnswer({
            key: requestBody,
            schedule: null,
            problems: ["The schedule could not be worked out. Try again."],
          });
        }
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [requestBody, localProblems.length]);

  const fresh = answer && answer.key === requestBody ? answer : null;
  const draftSchedule = fresh?.schedule ?? null;
  const problems = localProblems.length ? localProblems : (fresh?.problems ?? []);
  const pending = corrected && !fresh && !localProblems.length;
  const showingDraft = corrected && draftSchedule !== null;
  const schedule: ScheduleResult = showingDraft ? draftSchedule : view.schedule!;

  const save = (next: Draft) => saveCorrections(draftStorage, view.id, stamp, next, new Date());
  const discard = () => {
    clearCorrections(draftStorage, view.id);
    setEditing(false);
  };

  const reviewVerdict = describeVerdict({
    schedule: view.schedule!,
    deadline_day: original.deadline_day,
    deadline_candidates: view.deadlineCandidates,
    tasks: original.tasks,
  });
  const verdict = showingDraft
    ? describeVerdict({
        schedule,
        deadline_day: current.deadline_day,
        deadline_candidates: view.deadlineCandidates,
        tasks: current.tasks,
      })
    : reviewVerdict;

  const highlights: Highlight[] = useMemo(() => {
    const list: Highlight[] = [];
    if (view.quotes.deadline) list.push({ id: "deadline", ...view.quotes.deadline });
    view.quotes.findings.forEach((span, i) => span && list.push({ id: `finding:${i}`, ...span }));
    for (const [id, span] of Object.entries(view.quotes.tasks))
      if (span) list.push({ id: `task:${id}`, ...span });
    return list;
  }, [view.quotes]);

  // Bring the active passage, or the active remark, into view.
  useEffect(() => {
    if (!active || !scrollTarget.current) return;
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
    const element =
      scrollTarget.current === "plan"
        ? document.querySelector(`mark[data-ids~="${CSS.escape(active)}"]`)
        : document.getElementById(active.replace(":", "-"));
    element?.scrollIntoView({ block: "center", behavior });
    scrollTarget.current = null;
  }, [active]);

  // A remark's button can send Nora to a field (or the timeline): once it is
  // on screen, scroll to it and put the cursor there.
  useEffect(() => {
    if (!focusRequest) return;
    const element = document.getElementById(focusRequest.id);
    element?.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    element?.focus({ preventScroll: true });
  }, [focusRequest]);

  const fixes = fixesFor(review.findings, {
    original,
    current,
    originalSchedule: view.schedule!,
    currentSchedule: corrected ? draftSchedule : view.schedule!,
    deadlineCandidates: view.deadlineCandidates,
  });
  const fix = (action: FixAction) => {
    if (action.kind === "apply") return save(action.draft);
    if (action.kind === "edit") setEditing(true);
    const target = action.kind === "edit" ? action.focus : null;
    setFocusRequest({ id: target ?? SCHEDULE_TITLE_ID });
  };

  const showInPlan = (id: string) => {
    scrollTarget.current = "plan";
    setActive(id);
  };
  const showRemark = (id: string) => {
    scrollTarget.current = id.startsWith("finding:") ? "finding" : null;
    setActive(id);
  };

  const replyText = committeeSummary({ title: view.title, verdict, findings: review.findings });
  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(replyText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className={styles.workspace}>
      <div className={styles.main}>
        <VerdictPanel
          verdict={verdict}
          reviewVerdict={
            showingDraft && verdict.headline !== reviewVerdict.headline ? reviewVerdict : null
          }
          canShowDeadline={!!view.quotes.deadline}
          onShowDeadline={() => showInPlan("deadline")}
          pending={pending}
        />

        {corrected && (
          <CorrectionsPanel
            changes={changes}
            savedAt={saved?.savedAt ?? null}
            pending={pending}
            outcome={
              draftSchedule
                ? compareOutcomes(view.schedule!, draftSchedule, current.deadline_day)
                : null
            }
            problems={problems}
            onDiscard={discard}
          />
        )}

        <FindingList
          findings={review.findings}
          spans={view.quotes.findings}
          active={active}
          corrected={corrected}
          fixes={fixes}
          onFix={fix}
          onShow={showInPlan}
          onCopyReply={copyReply}
          copyState={copyState}
          replyText={replyText}
        />

        <ScheduleSection
          draft={current}
          schedule={schedule}
          editing={editing}
          active={active}
          hasQuote={(id) => !!view.quotes.tasks[id]}
          onToggleEditing={() => setEditing(!editing)}
          onSelect={showInPlan}
          onChange={save}
        />
      </div>

      {/* Scrolls on its own on wide screens, so it must take keyboard focus. */}
      <aside
        className={styles.side}
        tabIndex={0}
        aria-label="The plan, with quoted passages marked"
      >
        <section aria-label="The plan as sent" className={`${styles.card} ${styles.planCard}`}>
          <h2 className={styles.sectionTitle}>The plan as sent</h2>
          <p className={styles.sectionMeta}>
            Highlighted words are quoted in the remarks. Click them to go to the remark.
          </p>
          <PlanDocument
            text={view.text}
            highlights={highlights}
            active={active}
            isStanding={(id) => id === "deadline" || id.startsWith("finding:")}
            onSelect={showRemark}
          />
        </section>
      </aside>
    </div>
  );
}
