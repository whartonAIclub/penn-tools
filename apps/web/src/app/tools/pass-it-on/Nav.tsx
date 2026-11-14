"use client";

// The tool's tabs. Events is the home page; its sub-pages keep it highlighted.

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./PassItOn.module.css";

const BASE = "/tools/pass-it-on";
const TABS = [
  { href: BASE, label: "Events", active: (p: string) => p === BASE || p.startsWith(`${BASE}/events`) },
  { href: `${BASE}/roles`, label: "Roles", active: (p: string) => p.startsWith(`${BASE}/roles`) },
  { href: `${BASE}/board`, label: "Checklist", active: (p: string) => p.startsWith(`${BASE}/board`) },
  { href: `${BASE}/calendar`, label: "Calendar", active: (p: string) => p.startsWith(`${BASE}/calendar`) },
  { href: `${BASE}/template`, label: "Template", active: (p: string) => p.startsWith(`${BASE}/template`) },
  { href: `${BASE}/library`, label: "Library", active: (p: string) => p.startsWith(`${BASE}/library`) },
  { href: `${BASE}/ask`, label: "Ask", active: (p: string) => p.startsWith(`${BASE}/ask`) },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className={styles.tabs} aria-label="Pass It On">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={tab.active(pathname) ? styles.tabActive : styles.tab}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
