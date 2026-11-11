"use client";

// One proposed event: what the AI read, the spreadsheet row it came from, and
// Approve / Edit / Skip. Editing covers the main details; everything else the
// AI found is kept as it is.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StoredProposal } from "@penntools/tool-pass-it-on";
import type { EventFormValues } from "../actions";
import styles from "../PassItOn.module.css";
import { approveProposalAction, restoreProposalAction, saveProposalAction, skipProposalAction } from "./actions";

type Input = NonNullable<StoredProposal["input"]>;

const str = (n: number | null): string => (n === null ? "" : String(n));

function toFormValues(i: Input): EventFormValues {
  return {
    title: i.title,
    eventDate: i.eventDate ?? "",
    eventTime: i.eventTime ?? "",
    theme: i.theme ?? "",
    venue: i.venue ?? "",
    budget: str(i.budget),
    roles: i.roles.map((r) => ({ role: r.role, person: r.person ?? "" })),
    partnerClubs: i.partnerClubs,
    vendors: i.vendors.map((v) => (v.role ? `${v.name}: ${v.role}` : v.name)).join("\n"),
    notes: i.notes ?? "",
    confirmedClub: i.confirmedClub,
    confirmedVenue: i.confirmedVenue,
    clubContact: i.clubContact ?? "",
    totalAttendees: str(i.totalAttendees),
    dropIns: str(i.dropIns),
    ticketRevenue: str(i.ticketRevenue),
    costs: str(i.costs),
    cancelled: i.cancelled,
  };
}

const BADGE: Record<StoredProposal["matchKind"], string | null> = { new: null, changed: "Changes an existing event", unchanged: "Already on the calendar" };

export function ProposalCard({ proposal }: { proposal: StoredProposal }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<EventFormValues | null>(proposal.input ? toFormValues(proposal.input) : null);
  const [roleText, setRoleText] = useState(values ? values.roles.map((r) => (r.person ? `${r.role}: ${r.person}` : r.role)).join("\n") : "");
  const [clubText, setClubText] = useState(values ? values.partnerClubs.join("\n") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (!result.ok) setError(result.message ?? "That didn't work.");
      else router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(false);
  }

  const i = proposal.input;
  const set = (field: keyof EventFormValues) => (e: { target: { value: string } }) => values && setValues({ ...values, [field]: e.target.value });

  async function save() {
    if (!values) return;
    const roles = roleText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const colon = l.indexOf(":");
        return colon === -1 ? { role: l, person: "" } : { role: l.slice(0, colon).trim(), person: l.slice(colon + 1).trim() };
      });
    const partnerClubs = clubText.split(/[\n,]/).map((c) => c.trim()).filter(Boolean);
    await act(async () => {
      const result = await saveProposalAction(proposal.id, { ...values, roles, partnerClubs });
      if (result.ok) setEditing(false);
      return result;
    });
  }

  return (
    <div className={styles.proposal}>
      <div className={styles.spread}>
        <strong>{i?.title ?? "Not an event"}</strong>
        {BADGE[proposal.matchKind] && <span className={styles.tag}>{BADGE[proposal.matchKind]}</span>}
      </div>
      {i && !editing && (
        <p className={styles.muted}>
          {[i.eventDate ?? "No date", i.eventTime, i.venue, i.partnerClubs.length > 0 && `With ${i.partnerClubs.join(", ")}`, ...i.roles.map((r) => `${r.role}: ${r.person ?? "unassigned"}`)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {proposal.changes.length > 0 && <p className={styles.muted}>Differs in: {proposal.changes.join(", ")}</p>}
      {proposal.skipReason && <p className={styles.muted}>Skipped: {proposal.skipReason}</p>}
      <p className={styles.muted}>
        From {proposal.sheet}, row {proposal.row}: <span className={styles.code}>{proposal.sourceText}</span>
      </p>

      {editing && values && (
        <>
          <label className={styles.field}>
            Name
            <input className={styles.input} value={values.title} onChange={set("title")} />
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              Date
              <input className={styles.input} type="date" value={values.eventDate} onChange={set("eventDate")} />
            </label>
            <label className={styles.field}>
              Time
              <input className={styles.input} value={values.eventTime} onChange={set("eventTime")} />
            </label>
            <label className={styles.field}>
              Location
              <input className={styles.input} value={values.venue} onChange={set("venue")} />
            </label>
          </div>
          <label className={styles.field}>
            Roles (one per line, like &quot;Pub Leader: Ada&quot;)
            <textarea className={styles.textarea} value={roleText} onChange={(e) => setRoleText(e.target.value)} />
          </label>
          <label className={styles.field}>
            Partner clubs (one per line)
            <textarea className={styles.textarea} value={clubText} onChange={(e) => setClubText(e.target.value)} />
          </label>
          <label className={styles.field}>
            Notes
            <textarea className={styles.textarea} value={values.notes} onChange={set("notes")} />
          </label>
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.row}>
        {proposal.status === "approved" ? (
          proposal.eventId && (
            <Link href={`/tools/pass-it-on/events/${proposal.eventId}`} className={styles.link}>
              Approved. Open the event
            </Link>
          )
        ) : editing ? (
          <>
            <button className={styles.button} type="button" disabled={busy} onClick={() => void save()}>
              Save changes
            </button>
            <button className={styles.secondary} type="button" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {i && (
              <button className={styles.button} type="button" disabled={busy} onClick={() => void act(() => approveProposalAction(proposal.id))}>
                Approve
              </button>
            )}
            {i && (
              <button className={styles.secondary} type="button" disabled={busy} onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            {proposal.status === "pending" ? (
              <button className={styles.secondary} type="button" disabled={busy} onClick={() => void act(() => skipProposalAction(proposal.id))}>
                Skip
              </button>
            ) : (
              i && (
                <button className={styles.secondary} type="button" disabled={busy} onClick={() => void act(() => restoreProposalAction(proposal.id))}>
                  Restore
                </button>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
