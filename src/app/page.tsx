import { AppHeader } from "@/components/AppHeader";
import { PlanList } from "@/components/PlanList";
import { plans } from "@/server/data";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <main className={`${styles.page} ${styles.narrow}`}>
        <PlanList plans={plans.list()} />
      </main>
    </>
  );
}
