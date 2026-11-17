// /stats — visits to each tool, for anyone, signed in or not. It's the tool
// visits table from /admin, limited to tools still on the site; it has only
// per-tool counts, never who visited.

import type { Metadata } from "next";
import { toolRegistry } from "@penntools/core/tools";
import { cachedFor } from "@/lib/cache";
import { toolVisits } from "@/lib/container";
import { communityTools } from "@/data/communityTools";
import { visitsForEveryTool } from "@/lib/visitReport";
import cardPage from "@/components/layout/CardPage.module.css";
import { ToolVisitsTable } from "@/components/stats/ToolVisitsTable";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Stats",
};

// Rendered on each request, not once at build time (when there may be no
// database to read)...
export const dynamic = "force-dynamic";

// ...but the report, which counts every visit ever recorded, is read at most
// once a minute, however often the page is loaded, so its counts are never
// more than a minute old. /admin reads it fresh.
const recentReport = cachedFor(60_000, () => toolVisits.report());

export default async function StatsPage() {
  const visits = visitsForEveryTool(await recentReport(), toolRegistry.listManifests(), communityTools, {
    onlySiteTools: true,
  });
  return (
    <div className={styles.page}>
      <h1 className={cardPage.title}>Stats</h1>
      <section className={cardPage.card}>
        <h2 className={styles.heading}>Tool visits</h2>
        <ToolVisitsTable visits={visits} />
        <p className={cardPage.muted}>Counts are at most a minute old.</p>
      </section>
    </div>
  );
}
