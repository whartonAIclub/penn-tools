// A small "Admin access" link at the bottom left of the Penn Pals pages. It is
// only rendered for the emails in metrics/access.ts, decided on the server from
// the signed-in session, so everyone else gets a page without it.

import Link from "next/link";
import { canViewMetrics } from "@penntools/tool-penn-pals";
import { getCurrentUser } from "@/lib/auth";
import { METRICS_VIEWERS } from "./metrics/access";
import styles from "./AdminAccessLink.module.css";

export async function AdminAccessLink() {
  const user = await getCurrentUser();
  if (!user || !canViewMetrics(user.email, METRICS_VIEWERS, process.env.NODE_ENV === "production")) return null;
  return (
    <footer className={styles.footer}>
      <Link href="/tools/penn-pals/metrics" className={styles.link}>
        Admin access
      </Link>
    </footer>
  );
}
