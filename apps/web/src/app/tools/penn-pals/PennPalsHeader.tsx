"use client";

// The header on every Penn Pals page: the title and the same two buttons,
// with the current page's button highlighted.

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./PennPalsHeader.module.css";

const NAV = [
  { href: "/tools/penn-pals", label: "My network" },
  { href: "/tools/penn-pals/tracker", label: "Log a chat" },
];

export function PennPalsHeader() {
  const pathname = usePathname();
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>Penn Pals</h1>
        <p className={styles.intro}>Who you owe a follow-up, and everyone you&apos;ve talked to.</p>
      </div>
      <nav className={styles.nav} aria-label="Penn Pals">
        {NAV.map(({ href, label }) => {
          const current = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={current ? styles.current : styles.button}
              aria-current={current ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
