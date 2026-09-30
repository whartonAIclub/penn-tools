// Site-wide header: PennTools on the left. Rendered by the root layout.

import Link from "next/link";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        PennTools
      </Link>
    </header>
  );
}
