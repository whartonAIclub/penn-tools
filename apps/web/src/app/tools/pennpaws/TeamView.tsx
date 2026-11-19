"use client";

// The team's view: how PennPaws is doing, who has joined, and reports to act
// on. Only emails in TEAM_EMAILS (team.ts) get the Team button, and every
// action checks again on the server.

import { useEffect, useState } from "react";
import { REPORT_REASONS, ROLES, labelOf } from "@penntools/tool-pennpaws";
import { loadTeam, teamHide, teamPause, teamResolve, type TeamData } from "./actions";
import styles from "./PennPaws.module.css";

const ROLE_WORDS = { owner: "Owner", sitter: "Sitter", pals: "Pet Pals" } as const;

export function TeamView({ onOpenRequest }: { onOpenRequest: (id: string) => void }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTest, setShowTest] = useState(false);

  const refresh = async () => {
    const result = await loadTeam();
    if (result.ok) setData(result.data);
    else setError(result.error);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const act = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.error ?? "That didn't work. Try again.");
    else await refresh();
  };

  if (error && !data) return <p className={styles.error}>{error}</p>;
  if (!data) return <p className={styles.muted}>Loading...</p>;

  const { overview: o, reports } = data;
  const members = data.members.filter((m) => showTest || !m.test);
  const testCount = data.members.length - data.members.filter((m) => !m.test).length;
  const goodShare = o.offers.scored ? Math.round((o.offers.onGoodMatches / o.offers.scored) * 100) : null;

  return (
    <section className={styles.section}>
      <p className={styles.lead}>Only the PennPaws team sees this page.</p>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.statGrid}>
        <Stat value={o.members.total} label="Members" detail={`${o.members.owner} owners, ${o.members.sitter} sitters, ${o.members.pals} Pet Pals`} />
        <Stat value={o.members.joinedThisWeek} label="Joined this week" />
        <Stat value={o.requests.total} label="Requests" detail={`${o.requests.open} open, ${o.requests.agreed + o.requests.completed} booked`} />
        <Stat value={o.requests.completed} label="Finished bookings" />
        <Stat value={o.offers.total} label="Offers" detail={goodShare === null ? undefined : `${goodShare}% on a Great or Good match`} />
        <Stat value={o.openReports} label="Open reports" alert={o.openReports > 0} />
      </div>

      <h2 className={styles.subhead}>Reports</h2>
      {reports.length === 0 ? (
        <p className={styles.muted}>Nothing reported. Members can report a request or an offer from its page.</p>
      ) : (
        <ul className={styles.list}>
          {reports.map((r) => (
            <li key={r.id} className={styles.panel}>
              <p>
                <strong>{labelOf(REPORT_REASONS, r.reason)}</strong>
                <span className={styles.muted}>
                  {" "}
                  about {r.subject.firstName}&apos;s {r.kind === "request" ? "request" : "offer"} for {r.petName}, from {r.reporterFirstName}, {r.reportedOn}
                </span>
              </p>
              {r.details && <p className={styles.preLine}>{r.details}</p>}
              <div className={styles.teamActions}>
                <button type="button" className={styles.editLink} onClick={() => onOpenRequest(r.requestId)}>
                  Open the request
                </button>
                <button type="button" className={styles.editLink} disabled={busy} onClick={() => act(() => teamHide(r.requestId, !r.requestHidden))}>
                  {r.requestHidden ? "Show the request again" : "Hide the request"}
                </button>
                <button type="button" className={styles.editLink} disabled={busy} onClick={() => act(() => teamPause(r.subject.userId, !r.subject.paused))}>
                  {r.subject.paused ? `Unpause ${r.subject.firstName}` : `Pause ${r.subject.firstName}`}
                </button>
                <button type="button" className={styles.editLink} disabled={busy} onClick={() => act(() => teamResolve(r.id))}>
                  Mark resolved
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className={styles.subhead}>Members</h2>
      {testCount > 0 && (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} /> Show the {testCount} fake test people
        </label>
      )}
      {members.length === 0 ? (
        <p className={styles.muted}>No one has joined yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Where</th>
                <th>Joined</th>
                <th>Activity</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    {m.firstName}
                    {m.paused && <span className={styles.pill}> Paused</span>}
                    {m.reports > 0 && <span className={styles.pill}> {m.reports} reported</span>}
                  </td>
                  <td title={labelOf(ROLES, m.role)}>{ROLE_WORDS[m.role]}</td>
                  <td>{m.area ?? ""}</td>
                  <td>{m.joinedOn}</td>
                  <td>
                    {m.requests} {m.requests === 1 ? "request" : "requests"}, {m.offers} {m.offers === 1 ? "offer" : "offers"}
                  </td>
                  <td>
                    <button type="button" className={styles.editLink} disabled={busy} onClick={() => act(() => teamPause(m.userId, !m.paused))}>
                      {m.paused ? "Unpause" : "Pause"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ value, label, detail, alert = false }: { value: number; label: string; detail?: string | undefined; alert?: boolean }) {
  return (
    <div className={alert ? styles.statAlert : styles.stat}>
      <strong>{value}</strong>
      <span>{label}</span>
      {detail && <span className={styles.hint}>{detail}</span>}
    </div>
  );
}
