// /admin — AI spend by tool and by user, visits to each tool, and who the
// admins are, for the Platform team
//
// Only admins (lib/admin.ts) can see it; everyone else gets a 404, so the
// page's existence isn't advertised. "Free credit" is what the platform's
// keys paid; "Own key" is what users paid with their own keys, which is their
// use past the free credit (or of a provider the platform has no key for).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FREE_CREDIT_USD } from "@penntools/core/ai";
import { VISIT_RECENT_DAYS } from "@penntools/core/repositories";
import { toolRegistry } from "@penntools/core/tools";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { admins, aiUsage, toolVisits } from "@/lib/container";
import { communityToolByVisitId, communityTools, communityVisitId, isCommunityVisitId } from "@/data/communityTools";
import cardPage from "@/components/layout/CardPage.module.css";
import { Admins } from "./Admins";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Admin",
};

/** Users shown, most spent first. */
const USER_LIMIT = 500;

/**
 * A user with less free credit left than this counts as low on it. Calls
 * reserve their expected cost first, so users stop a little short of the
 * full credit rather than reaching it exactly.
 */
const LOW_CREDIT_LEFT_USD = 0.05;
const LOW_CREDIT_USD = FREE_CREDIT_USD - LOW_CREDIT_LEFT_USD;

function usd(amount: number): string {
  if (amount > 0 && amount < 0.01) return "<$0.01";
  return `$${amount.toFixed(2)}`;
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** A tool's title, or its ID once it's been removed. */
function toolName(toolId: string): string {
  return toolRegistry.get(toolId)?.manifest.title ?? communityToolByVisitId(toolId)?.title ?? toolId;
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !(await isAdmin(user))) notFound();

  const [{ totals, byTool, byUser }, visited, adminList] = await Promise.all([
    aiUsage.report({ limit: USER_LIMIT, lowCreditUsd: LOW_CREDIT_USD }),
    toolVisits.report(),
    admins.list(),
  ]);
  // Every tool on the site, so ones no one has opened show too.
  const unvisited = [
    ...toolRegistry.listManifests().map((manifest) => manifest.id),
    ...communityTools.map((tool) => communityVisitId(tool.id)),
  ]
    .filter((toolId) => !visited.some((tool) => tool.toolId === toolId))
    .map((toolId) => ({ toolId, visits: 0, users: 0, recentVisits: 0, recentUsers: 0 }));
  const visits = [...visited, ...unvisited];

  return (
    <div className={styles.page}>
      <h1 className={cardPage.title}>Admin</h1>
      <h2 className={styles.heading}>AI usage</h2>

      <section className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{usd(totals.platformUsd)}</span>
          <span className={cardPage.muted}>paid by PennTools (free credit)</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{usd(totals.userKeyUsd)}</span>
          <span className={cardPage.muted}>paid with users&apos; own keys</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{count(totals.users)}</span>
          <span className={cardPage.muted}>users</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{count(totals.usersLowOnCredit)}</span>
          <span className={cardPage.muted}>
            have less than {usd(LOW_CREDIT_LEFT_USD)} of their {usd(FREE_CREDIT_USD)} free credit left
          </span>
        </div>
      </section>
      <p className={cardPage.muted}>
        {count(totals.calls)} calls in all. Costs are at list prices when each call was made.
        {totals.estimatedCalls > 0 &&
          ` ${count(totals.estimatedCalls)} were cut short before the provider reported usage, so their tokens are estimated.`}
      </p>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>By tool</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tool</th>
                <th className={styles.num}>Calls</th>
                <th className={styles.num}>Users</th>
                <th className={styles.num}>Input tokens</th>
                <th className={styles.num}>Output tokens</th>
                <th className={styles.num}>Free credit</th>
                <th className={styles.num}>Own key</th>
              </tr>
            </thead>
            <tbody>
              {byTool.map((tool) => (
                <tr key={tool.toolId}>
                  <td>{toolName(tool.toolId)}</td>
                  <td className={styles.num}>{count(tool.calls)}</td>
                  <td className={styles.num}>{count(tool.users)}</td>
                  <td className={styles.num}>{count(tool.inputTokens)}</td>
                  <td className={styles.num}>{count(tool.outputTokens)}</td>
                  <td className={styles.num}>{usd(tool.platformUsd)}</td>
                  <td className={styles.num}>{usd(tool.userKeyUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {byTool.length === 0 && <p className={cardPage.muted}>No AI calls yet.</p>}
      </section>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>By user</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th className={styles.num}>Calls</th>
                <th className={styles.num}>Free credit used</th>
                <th className={styles.num}>Own key</th>
                <th className={styles.num}>Last used</th>
              </tr>
            </thead>
            <tbody>
              {byUser.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <div>{row.name ?? "—"}</div>
                    <div className={cardPage.muted}>{row.email ?? row.userId}</div>
                  </td>
                  <td className={styles.num}>{count(row.calls)}</td>
                  <td className={`${styles.num} ${row.platformUsd >= LOW_CREDIT_USD ? styles.atLimit : ""}`}>
                    {usd(row.platformUsd)}
                  </td>
                  <td className={styles.num}>{usd(row.userKeyUsd)}</td>
                  <td className={styles.num}>{row.lastUsedAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {byUser.length === USER_LIMIT && (
          <p className={cardPage.muted}>Showing the {USER_LIMIT} users who&apos;ve spent the most.</p>
        )}
      </section>

      <h2 className={styles.heading}>Tool visits</h2>
      <section className={cardPage.card}>
        <p className={cardPage.muted}>
          A visit is opening a tool, signed in or not; moving between its pages isn&apos;t another one. For an
          external tool, it&apos;s a click on its link in the sidebar or on the dashboard, so people who reach its
          site another way aren&apos;t counted. Users counts signed-in people only.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tool</th>
                <th className={styles.num}>Visits ({VISIT_RECENT_DAYS} days)</th>
                <th className={styles.num}>Users ({VISIT_RECENT_DAYS} days)</th>
                <th className={styles.num}>Visits (all time)</th>
                <th className={styles.num}>Users (all time)</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((tool) => (
                <tr key={tool.toolId}>
                  <td>
                    {toolName(tool.toolId)}
                    {isCommunityVisitId(tool.toolId) && <span className={cardPage.muted}> · external</span>}
                  </td>
                  <td className={styles.num}>{count(tool.recentVisits)}</td>
                  <td className={styles.num}>{count(tool.recentUsers)}</td>
                  <td className={styles.num}>{count(tool.visits)}</td>
                  <td className={styles.num}>{count(tool.users)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>Admins</h2>
        <p className={cardPage.muted}>
          Admins can see this page and add or remove other admins. Anyone with a Penn email can be added, even before
          they first sign in.
        </p>
        <Admins initial={adminList} me={user.email ?? ""} />
      </section>
    </div>
  );
}
