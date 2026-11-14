"use client";

// After matching, on the request page: how the sitter gets in, each visit
// checked in with a photo, and the owner paying for each visit. The data
// comes from visits.ts through visitActions.ts.

import { useCallback, useEffect, useState } from "react";
import {
  KEY_METHODS,
  VISIT_PAY_METHODS,
  labelOf,
  payLink,
  type AfterMatchView,
  type EntryGuide,
  type KeyMethod,
  type Visit,
  type VisitPayMethod,
} from "@penntools/tool-pennpaws";
import { shrinkPhoto } from "./MyPets";
import styles from "./PennPaws.module.css";
import { arrive, leave, loadAfterMatch, payVisit, saveGuide, saveHandles } from "./visitActions";

type Result = { ok: true; data: unknown } | { ok: false; error: string };

const DETAIL_LABEL: Record<KeyMethod, { label: string; placeholder: string }> = {
  meet: { label: "When and where you'll hand over the key", placeholder: "Sunday 6pm at my place, I'll show you around" },
  doorman: { label: "What to tell the front desk", placeholder: "Say you're picking up keys for 4B, under Lu" },
  lockbox: { label: "The code, and where the box is", placeholder: "Box on the railing by the side door, code 2417" },
  hidden: { label: "Where the key is", placeholder: "Under the blue plant pot left of the door" },
  smart_lock: { label: "Anything they should know", placeholder: "Text me when you're outside and I'll unlock it" },
  other: { label: "How they get in", placeholder: "My roommate Sam will let you in" },
};

const time = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

export function AfterMatch({ requestId, onChanged }: { requestId: string; onChanged: () => void }) {
  const [view, setView] = useState<AfterMatchView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => setView(await loadAfterMatch(requestId)), [requestId]);
  useEffect(() => {
    void reload();
    // A check-in should show up without a refresh, while someone waits for one.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const act = async (fn: () => Promise<Result>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    await reload();
    onChanged();
    return true;
  };

  if (!view) return null;
  const booked = view.status === "agreed" || view.status === "completed";

  return (
    <div className={styles.afterMatch}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <GuideCard view={view} busy={busy} onSave={(guide) => act(() => saveGuide(requestId, guide))} />

      {booked && <VisitsCard view={view} busy={busy} act={act} requestId={requestId} />}

      {view.role === "sitter" && <HandlesCard view={view} busy={busy} onSave={(h) => act(() => saveHandles(h))} />}
    </div>
  );
}

// ── How to get in ────────────────────────────────────────────────────────────

function GuideCard({ view, busy, onSave }: { view: AfterMatchView; busy: boolean; onSave: (guide: EntryGuide) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const isOwner = view.role === "owner";

  if (isOwner && (editing || !view.guide)) {
    return <GuideForm initial={view.guide} sitter={view.otherFirstName} pet={view.petName} busy={busy} onCancel={view.guide ? () => setEditing(false) : null} onSave={async (g) => (await onSave(g)) && setEditing(false)} />;
  }

  return (
    <section className={styles.amCard}>
      <div className={styles.amHead}>
        <h3 className={styles.amTitle}>How to get in</h3>
        {isOwner && (
          <button type="button" className={styles.link} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {view.guide ? (
        <GuideSteps guide={view.guide} />
      ) : view.guideLocked ? (
        <p className={styles.muted}>{view.otherFirstName} has written how to get in. You'll see it, codes included, once you both approve the agreement.</p>
      ) : (
        <p className={styles.muted}>{view.otherFirstName} hasn't added this yet. Ask in your messages, or wait for a notification.</p>
      )}
    </section>
  );
}

function GuideSteps({ guide }: { guide: EntryGuide }) {
  const steps = [
    guide.building && { title: "Building", text: guide.building },
    guide.unit && { title: "Apartment", text: guide.unit },
    { title: labelOf(KEY_METHODS, guide.keyMethod), text: guide.keyDetails },
    guide.quirks && { title: "Good to know", text: guide.quirks },
  ].filter(Boolean) as { title: string; text: string | null }[];
  return (
    <ol className={styles.steps}>
      {steps.map((s, i) => (
        <li key={i}>
          <span className={styles.stepNum}>{i + 1}</span>
          <div>
            <strong>{s.title}</strong>
            {s.text && <p className={styles.preLine}>{s.text}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function GuideForm({
  initial,
  sitter,
  pet,
  busy,
  onCancel,
  onSave,
}: {
  initial: EntryGuide | null;
  sitter: string;
  pet: string;
  busy: boolean;
  onCancel: (() => void) | null;
  onSave: (guide: EntryGuide) => void;
}) {
  const [g, setG] = useState<EntryGuide>(initial ?? { building: null, unit: null, keyMethod: "meet", keyDetails: null, quirks: null });
  const set = (patch: Partial<EntryGuide>) => setG((prev) => ({ ...prev, ...patch }));
  const detail = DETAIL_LABEL[g.keyMethod];

  return (
    <section className={styles.amCard}>
      <h3 className={styles.amTitle}>Help {sitter} get in</h3>
      <p className={styles.muted}>Four quick answers, and {sitter} has everything for the first visit. Codes stay hidden until you both approve.</p>

      <label className={styles.field}>
        <span className={styles.label}>1. The building</span>
        <input className={styles.input} value={g.building ?? ""} maxLength={120} placeholder="Main door on Locust St, buzz 4B" onChange={(e) => set({ building: e.target.value })} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>2. Your apartment</span>
        <input className={styles.input} value={g.unit ?? ""} maxLength={120} placeholder="4B, third floor, first door left of the stairs" onChange={(e) => set({ unit: e.target.value })} />
      </label>
      <div className={styles.field}>
        <span className={styles.label}>3. The key</span>
        <div className={styles.rows}>
          {KEY_METHODS.map((m) => (
            <button key={m.value} type="button" className={g.keyMethod === m.value ? styles.rowOptionOn : styles.rowOption} aria-pressed={g.keyMethod === m.value} onClick={() => set({ keyMethod: m.value })}>
              {m.label}
              <span className={styles.muted}>{m.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>{detail.label}</span>
        <input className={styles.input} value={g.keyDetails ?? ""} maxLength={300} placeholder={detail.placeholder} onChange={(e) => set({ keyDetails: e.target.value })} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>4. Anything tricky?</span>
        <textarea className={styles.input} rows={2} value={g.quirks ?? ""} maxLength={300} placeholder={`Jiggle the handle. ${pet} likes to dart for the door, so come in sideways.`} onChange={(e) => set({ quirks: e.target.value })} />
      </label>

      <button type="button" className={styles.primary} disabled={busy} onClick={() => onSave(g)}>
        {busy ? "Saving…" : `Share with ${sitter}`}
      </button>
      {onCancel && (
        <button type="button" className={styles.link} onClick={onCancel}>
          Keep what I had
        </button>
      )}
    </section>
  );
}

// ── Visits ───────────────────────────────────────────────────────────────────

function VisitsCard({ view, busy, act, requestId }: { view: AfterMatchView; busy: boolean; act: (fn: () => Promise<Result>) => Promise<boolean>; requestId: string }) {
  const open = view.visits.find((v) => !v.leftAt) ?? null;
  const isSitter = view.role === "sitter";
  return (
    <section className={styles.amCard}>
      <h3 className={styles.amTitle}>Visits</h3>
      {isSitter && view.status === "agreed" && (
        <CheckInBox
          key={open ? "leave" : "arrive"}
          arriving={!open}
          pet={view.petName}
          owner={view.otherFirstName}
          openSince={open?.arrivedAt ?? null}
          busy={busy}
          onSend={(photo, note) => act(() => (open ? leave(requestId, { photo, note }) : arrive(requestId, { photo, note })))}
        />
      )}
      {view.visits.length === 0 ? (
        <p className={styles.muted}>
          {isSitter
            ? `Each time you arrive, tap the button and send ${view.otherFirstName} a photo of ${view.petName}.`
            : `When ${view.otherFirstName} arrives, they'll check in here with a photo of ${view.petName}. You'll get a notification.`}
        </p>
      ) : (
        <ol className={styles.visitList}>
          {view.visits.map((v) => (
            <VisitItem key={v.id} visit={v} view={view} busy={busy} onPay={(p) => act(() => payVisit(requestId, v.id, p))} />
          ))}
        </ol>
      )}
    </section>
  );
}

function CheckInBox({
  arriving,
  pet,
  owner,
  openSince,
  busy,
  onSend,
}: {
  arriving: boolean;
  pet: string;
  owner: string;
  openSince: string | null;
  busy: boolean;
  onSend: (photo: string | null, note: string | null) => Promise<boolean>;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const ready = !arriving || photo !== null;
  return (
    <div className={styles.checkIn}>
      <strong>{arriving ? `Arrived? Say hi to ${owner} with a photo of ${pet}.` : `Checked in ${openSince ? time(openSince) : ""}. Tap Done when you leave.`}</strong>
      <label className={photo ? styles.petPhotoPickOn : styles.petPhotoPick}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={`Your photo of ${pet}`} />
        ) : (
          <span className={styles.petPhotoPlus} aria-hidden="true">
            +
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className={styles.visuallyHidden}
          aria-label={arriving ? `Take a photo of ${pet}` : "Add a last photo (optional)"}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              setPhoto(await shrinkPhoto(file));
              setPhotoError(null);
            } catch {
              setPhotoError("That photo couldn't be read. Try a JPEG or PNG.");
            }
          }}
        />
      </label>
      <span className={styles.hint}>{arriving ? `A photo is required, so ${owner} can see ${pet} is OK.` : "A last photo is optional."}</span>
      {photoError && <span className={styles.error}>{photoError}</span>}
      <input className={styles.input} value={note} maxLength={500} placeholder={arriving ? `${pet} met me at the door` : `Fed, fresh water, played for 10 minutes`} onChange={(e) => setNote(e.target.value)} />
      <button
        type="button"
        className={styles.primary}
        disabled={busy || !ready}
        onClick={async () => {
          if (await onSend(photo, note.trim() || null)) {
            setPhoto(null);
            setNote("");
          }
        }}
      >
        {busy ? "Sending…" : arriving ? `I'm here with ${pet}` : "Done for this visit"}
      </button>
    </div>
  );
}

function VisitItem({ visit, view, busy, onPay }: { visit: Visit; view: AfterMatchView; busy: boolean; onPay: (p: { amount: number; method: VisitPayMethod }) => Promise<boolean> }) {
  const sitterName = view.role === "owner" ? view.otherFirstName : "You";
  return (
    <li className={styles.visit}>
      <div className={styles.visitLine}>
        <span className={styles.visitDot} aria-hidden="true" />
        <span>
          <strong>{sitterName} arrived</strong> <span className={styles.hint}>{time(visit.arrivedAt)}</span>
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.visitPhoto} src={visit.arrivedPhoto} alt={`Photo of ${view.petName} from the visit`} />
      {visit.arrivedNote && <p className={styles.visitNote}>“{visit.arrivedNote}”</p>}
      {visit.leftAt ? (
        <>
          <div className={styles.visitLine}>
            <span className={styles.visitDotDone} aria-hidden="true" />
            <span>
              <strong>Visit done</strong> <span className={styles.hint}>{time(visit.leftAt)}</span>
            </span>
          </div>
          {visit.leftPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.visitPhoto} src={visit.leftPhoto} alt={`Last photo of ${view.petName}`} />
          )}
          {visit.leftNote && <p className={styles.visitNote}>“{visit.leftNote}”</p>}
          {visit.paid ? (
            <span className={styles.pillGood}>
              Paid {money(visit.paid.amount)} by {labelOf(VISIT_PAY_METHODS, visit.paid.method)}
            </span>
          ) : view.role === "owner" ? (
            <PayBox view={view} busy={busy} onPay={onPay} />
          ) : (
            <span className={styles.pill}>Waiting for {view.otherFirstName} to pay</span>
          )}
        </>
      ) : (
        <span className={styles.pill}>With {view.petName} now</span>
      )}
    </li>
  );
}

function PayBox({ view, busy, onPay }: { view: AfterMatchView; busy: boolean; onPay: (p: { amount: number; method: VisitPayMethod }) => Promise<boolean> }) {
  const [amount, setAmount] = useState(view.rate ? String(view.rate) : "");
  const [method, setMethod] = useState<VisitPayMethod>(view.handles?.venmo ? "venmo" : view.handles?.paypal ? "paypal" : "venmo");
  const dollars = Number(amount);
  const valid = Number.isFinite(dollars) && dollars > 0;
  const note = `PennPaws visit with ${view.petName}`;
  return (
    <div className={styles.payBox}>
      <strong>Pay {view.otherFirstName} for this visit</strong>
      <label className={styles.payAmount}>
        <span>$</span>
        <input className={styles.input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
      </label>
      <div className={styles.payLinks}>
        {view.handles?.venmo && valid && (
          <a className={styles.primary} href={payLink("venmo", view.handles.venmo, dollars, note)} target="_blank" rel="noopener noreferrer" onClick={() => setMethod("venmo")}>
            Pay with Venmo
          </a>
        )}
        {view.handles?.paypal && valid && (
          <a className={styles.primary} href={payLink("paypal", view.handles.paypal, dollars, note)} target="_blank" rel="noopener noreferrer" onClick={() => setMethod("paypal")}>
            Pay with PayPal
          </a>
        )}
      </div>
      {!view.handles?.venmo && !view.handles?.paypal && <span className={styles.hint}>{view.otherFirstName} hasn't added Venmo or PayPal yet. Pay the way you agreed, then mark it here.</span>}
      <div className={styles.payConfirm}>
        <select className={styles.input} value={method} onChange={(e) => setMethod(e.target.value as VisitPayMethod)} aria-label="How you paid">
          {VISIT_PAY_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button type="button" className={styles.secondary} disabled={busy || !valid} onClick={() => void onPay({ amount: dollars, method })}>
          I paid {valid ? money(dollars) : ""}
        </button>
      </div>
      <span className={styles.hint}>Money goes straight from you to {view.otherFirstName}. PennPaws never holds it.</span>
    </div>
  );
}

// ── The sitter's payment usernames ───────────────────────────────────────────

function HandlesCard({ view, busy, onSave }: { view: AfterMatchView; busy: boolean; onSave: (h: { venmo: string | null; paypal: string | null }) => Promise<boolean> }) {
  const [editing, setEditing] = useState(!view.handles);
  const [venmo, setVenmo] = useState(view.handles?.venmo ?? "");
  const [paypal, setPaypal] = useState(view.handles?.paypal ?? "");
  return (
    <section className={styles.amCard}>
      <div className={styles.amHead}>
        <h3 className={styles.amTitle}>How {view.otherFirstName} pays you</h3>
        {!editing && (
          <button type="button" className={styles.link} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <>
          <p className={styles.muted}>After each visit, {view.otherFirstName} gets a button that opens Venmo or PayPal with your name and the amount filled in.</p>
          <label className={styles.field}>
            <span className={styles.label}>Venmo username</span>
            <input className={styles.input} value={venmo} placeholder="@your-name" onChange={(e) => setVenmo(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>PayPal.Me name</span>
            <input className={styles.input} value={paypal} placeholder="yourname" onChange={(e) => setPaypal(e.target.value)} />
          </label>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={async () => {
              if (await onSave({ venmo: venmo.trim() || null, paypal: paypal.trim() || null })) setEditing(false);
            }}
          >
            Save
          </button>
        </>
      ) : (
        <p>
          {[view.handles?.venmo && `Venmo @${view.handles.venmo}`, view.handles?.paypal && `PayPal.Me/${view.handles.paypal}`].filter(Boolean).join(" · ")}
        </p>
      )}
    </section>
  );
}
