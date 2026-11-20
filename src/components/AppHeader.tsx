import Link from "next/link";
import { Icon } from "./Icon";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/">
        <span className={styles.mark}>
          <Icon name="logo" />
        </span>
        Plan reviewer
      </Link>
      <span className={styles.org}>Pellerby Town Council · Events office</span>
    </header>
  );
}
