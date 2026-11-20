import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import styles from "./page.module.css";

export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main className={`${styles.page} ${styles.narrow}`}>
        <h1>Plan not found</h1>
        <p className={styles.meta}>
          There is no plan at this address. <Link href="/">See all event plans</Link>.
        </p>
      </main>
    </>
  );
}
