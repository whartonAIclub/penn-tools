"use client";

// One request, as the viewer may see it: a sitter can ask the owner questions
// and accept the job, the owner replies and picks one sitter from everyone who
// accepted, and both review and approve the care agreement.
// Contacts appear only once both have approved. Either person marks the
// booking done, then the owner can rate it; the sitter sees ratings only
// anonymously, in Completed.

import { useCallback, useEffect, useState } from "react";
import { FIT_LABELS, REPORT_REASONS, addressFrom, describe, type AgreementTerms, type Contact, type SitterCard, type AskCheck, type Match } from "@penntools/tool-pennpaws";
import { accept, approve, askForChange, cancel, loadRequest, markDone, offer, rate, report, withdraw, type ActionResult, type RequestPage } from "./actions";
import { Conversation } from "./Conversation";
import { CheckIcon, PetAvatar } from "./PennPaws";
import styles from "./PennPaws.module.css";

const TERM_LABELS: [keyof AgreementTerms, string][] = [
  ["dates", "Dates"],
  ["visits", "Visits"],
  ["care", "Care"],
  ["keys", "Keys"],
  ["pay", "Pay"],
  ["vet", "Vet"],
  ["ifUrgent", "If urgent"],
  ["notes", "Notes"],
];

export function RequestDetail({
  requestId,
  hasAI,
  match,
  onBack,
  onChanged,
}: {
  requestId: string;
  /** Whether the user saved an API key, for "Help me write" in messages. */
  hasAI: boolean;
  /** How this request fits the viewer, when they're a sitter looking at an open request. */
  match: Match | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [request, setRequest] = useState<RequestPage | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [change, setChange] = useState("");
  const [changing, setChanging] = useState(false);

  const reload = useCallback(async () => setRequest(await loadRequest(requestId)), [requestId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  /** Runs an action, then reloads this request and the page's lists. */
  const act = async (fn: () => Promise<ActionResult<unknown>>) => {
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

  if (request === undefined) return <p className={styles.muted}>Loading…</p>;
  if (request === null) {
    return (
      <section className={styles.section}>
        <BackButton onBack={onBack} />
        <p>This request isn't available any more.</p>
      </section>
    );
  }

  const lines = describe(request.draft);
  const { role, agreement } = request;
  const myApproval = agreement && (role === "owner" ? agreement.ownerApproved : agreement.sitterApproved);
  const otherName = role === "owner" ? request.sitterFirstName : request.ownerFirstName;
  const pendingOffers = request.offers.filter((o) => o.status === "pending");
  const boarding = request.draft.careType === "boarding";
  const myMatch = !request.mine ? match : null;

  return (
    <section className={styles.section}>
      <BackButton onBack={onBack} />

      <div className={styles.detailHead}>
        <PetAvatar name={request.draft.petName} photo={request.draft.photo} large />
        <div className={styles.cardName}>
          <h2 className={styles.petName}>{request.draft.petName}</h2>
          <span className={styles.muted}>{lines.pet}</span>
          <span className={styles.owner}>
            <CheckIcon /> {request.mine ? "Your request" : `Posted by ${request.ownerFirstName}, verified Penn student`}
          </span>
        </div>
      </div>

      <dl className={styles.panel}>
        <dt>When</dt>
        <dd>{lines.when}</dd>
        <dt>{request.draft.careType === "visits" ? "Visits" : "Stay"}</dt>
        <dd>{lines.visits}</dd>
        <dt>Care</dt>
        <dd>{lines.care}</dd>
        {request.draft.area && (
          <>
            <dt>Where</dt>
            <dd>{request.draft.area}. Exact address once you both approve.</dd>
          </>
        )}
        <dt>{boarding ? "Handover" : "Keys"}</dt>
        <dd>{lines.access}</dd>
        {lines.sitter && (
          <>
            <dt>Sitter</dt>
            <dd>{lines.sitter}</dd>
          </>
        )}
        {request.draft.vet && (
          <>
            <dt>Vet</dt>
            <dd>{request.draft.vet}</dd>
          </>
        )}
        {request.draft.notes && (
          <>
            <dt>Notes</dt>
            <dd className={styles.preLine}>{request.draft.notes}</dd>
          </>
        )}
        <dt>Pay</dt>
        <dd>
          <strong>{request.draft.pay}</strong>
        </dd>
      </dl>

      {request.petNotes && (
        <div className={styles.panelPlain}>
          <strong>{request.mine ? "Private notes for your sitter" : `About ${request.draft.petName}`}</strong>
          <span className={styles.preLine}>{request.petNotes}</span>
          {request.mine && request.draft.petIds.length > 0 && (
            <span className={styles.hint}>Sitters who offer see temperament and anything you chose to share early. Breed, food and health show once you&apos;ve both approved.</span>
          )}
          {request.mine && request.draft.petIds.length === 0 && <span className={styles.hint}>Sitters see this once they offer. Not shown on the public request.</span>}
          {!request.mine && <span className={styles.hint}>Shared with you because you offered. Not shown on the public request.</span>}
        </div>
      )}

      {request.draft.original && (
        <details className={styles.original}>
          <summary>
            {request.mine ? "Your" : `${request.ownerFirstName}'s`} original post{request.draft.originalLanguage ? ` (${request.draft.originalLanguage})` : ""}
          </summary>
          <p className={styles.preLine}>{request.draft.original}</p>
        </details>
      )}

      {myMatch && (myMatch.reasons.length > 0 || myMatch.concerns.length > 0) && (
        <div className={styles.panelPlain}>
          <strong>How you match{FIT_LABELS[myMatch.fit] ? `: ${FIT_LABELS[myMatch.fit]}` : ""}</strong>
          <MatchList match={{ fits: myMatch.reasons, misses: myMatch.concerns }} />
          <span className={styles.hint}>From your profile. Change it in My profile.</span>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {/* A sitter who hasn't offered yet writes in the message box below, which
          carries both Offer to help and Send. */}
      {!request.mine && role === null && request.status !== "open" && <p className={styles.muted}>This request already has a sitter.</p>}

      {/* A sitter who offered */}
      {role === "sitter" && request.myOffer?.status === "pending" && (
        <div className={styles.notice}>You offered to help. We'll let you know when {request.ownerFirstName} picks a sitter.</div>
      )}

      {/* A sitter's conversation with the owner */}
      {!request.mine && request.threads[0] && (request.threads[0].canSend || request.threads[0].messages.length > 0) && (
        <Conversation
          key={`${request.threads[0].messages.length}`}
          requestId={request.id}
          thread={request.threads[0]}
          title={`Messages with ${request.ownerFirstName}`}
          otherFirstName={request.ownerFirstName}
          hasAI={hasAI}
          onSent={reload}
          offerAction={
            role === null && request.status === "open"
              ? {
                  label: "Offer to help",
                  hint: `${request.ownerFirstName} picks one sitter from everyone who accepts, and sees your first name and this note. Emails are shared only after you both approve.`,
                  onOffer: (note) => act(() => offer(request.id, note)),
                }
              : undefined
          }
        />
      )}
      {role === "sitter" && request.myOffer?.status === "declined" && (
        <div className={styles.panelPlain}>{request.draft.petName} found another sitter this time. Thanks for offering.</div>
      )}

      {/* The owner, before picking */}
      {role === "owner" && request.status === "open" && (
        <div className={styles.stack}>
          <h3 className={styles.heading}>Offers</h3>
          {pendingOffers.length === 0 ? (
            <p className={styles.muted}>No offers yet. We'll notify you as soon as someone offers.</p>
          ) : (
            pendingOffers.map((o) => (
              <div key={o.id} className={styles.offer}>
                <strong>
                  <CheckIcon /> {o.sitterFirstName}, Penn
                </strong>
                {o.sitter && <SitterCardView card={o.sitter} />}
                <p className={styles.preLine}>{o.message}</p>
                {o.match && <MatchList match={o.match} />}
                <button type="button" className={styles.primary} disabled={busy} onClick={() => void act(() => accept(o.id))}>
                  Choose {o.sitterFirstName}
                </button>
                <ReportLink kind="offer" targetId={o.id} what={`${o.sitterFirstName}'s offer`} />
              </div>
            ))
          )}
        </div>
      )}

      {/* The owner's conversations, one per sitter who wrote */}
      {request.mine &&
        request.threads
          .filter((t) => t.canSend || t.messages.length > 0)
          .map((t) => (
            <Conversation
              key={`${t.id}-${t.messages.length}`}
              requestId={request.id}
              thread={t}
              title={`Messages with ${t.sitterFirstName}`}
              otherFirstName={t.sitterFirstName}
              hasAI={hasAI}
              onSent={reload}
            />
          ))}

      {/* The agreement */}
      {agreement && (request.status === "matched" || request.status === "agreed") && (
        <div className={styles.stack}>
          <h3 className={styles.heading}>Care agreement</h3>
          {request.status === "matched" && (
            <p className={styles.muted}>Drafted from the request. Read it through; either of you can ask for a change before approving.</p>
          )}
          <dl className={styles.panel}>
            <dt>Owner</dt>
            <dd>{request.ownerFirstName}</dd>
            <dt>Sitter</dt>
            <dd>{request.sitterFirstName}</dd>
            {TERM_LABELS.map(([key, label]) =>
              agreement.terms[key] ? (
                <Term key={key} label={label} value={agreement.terms[key]!} changed={!!agreement.lastChange?.fields.includes(key)} />
              ) : key === "vet" && request.status === "matched" ? (
                <Term key={key} label={label} value="Not given yet. Use Ask for a change to add the vet's name and phone." muted />
              ) : null,
            )}
          </dl>
          {agreement.lastChange && request.status === "matched" && (
            <p className={styles.changeNote}>
              {agreement.lastChange.byFirstName} asked: &ldquo;{agreement.lastChange.text}&rdquo;
              {agreement.lastChange.fields.length > 0 && (
                <> Changed: {agreement.lastChange.fields.map((f) => TERM_LABELS.find(([k]) => k === f)?.[1] ?? f).join(", ")}.</>
              )}
            </p>
          )}

          <ul className={styles.approvals}>
            <Approval name={request.ownerFirstName} done={agreement.ownerApproved} isYou={role === "owner"} />
            <Approval name={request.sitterFirstName ?? "Sitter"} done={agreement.sitterApproved} isYou={role === "sitter"} />
          </ul>

          {request.status === "matched" && !changing && (
            <div className={styles.row}>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => setChanging(true)}>
                Ask for a change
              </button>
            </div>
          )}
          {request.status === "matched" && !myApproval && !changing && role && (
            <ApproveForm
              key={agreement.version}
              hostsCare={addressFrom(request.draft.careType) === role}
              boarding={request.draft.careType === "boarding"}
              savedPhone={request.savedPhone}
              busy={busy}
              onApprove={(handoff) => act(() => approve(request.id, agreement.version, handoff))}
            />
          )}
          {request.status === "matched" && myApproval && !changing && <p className={styles.muted}>You approved. Waiting for {otherName}.</p>}

          {changing && (
            <form
              className={styles.panelPlain}
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act(() => askForChange(request.id, change))) {
                  setChanging(false);
                  setChange("");
                }
              }}
            >
              <label htmlFor="pp-change" className={styles.label}>
                What should change?
              </label>
              <textarea
                id="pp-change"
                className={styles.input}
                rows={3}
                maxLength={500}
                value={change}
                onChange={(e) => setChange(e.target.value)}
                placeholder="Walks at 7am and 6pm. Vet is University City Animal Clinic."
              />
              <span className={styles.hint}>Both approvals reset so you each see the new version.</span>
              <div className={styles.row}>
                <button type="button" className={styles.secondary} onClick={() => setChanging(false)}>
                  Never mind
                </button>
                <button type="submit" className={styles.primary} disabled={busy || !change.trim()}>
                  Send change
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {request.contacts && (
        <div className={styles.noticeGood}>
          <strong>You're booked</strong>
          <span>Text each other to plan a quick meet-and-greet and the key handoff.</span>
          <ContactLines name={request.ownerFirstName} contact={request.contacts.owner} />
          <ContactLines name={request.sitterFirstName ?? "Sitter"} contact={request.contacts.sitter} />
        </div>
      )}

      {role && request.status === "agreed" && (
        <div className={styles.panelPlain}>
          <span>When the care is finished, mark it done. {otherName} is told.</span>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void act(() => markDone(request.id))}>
            Mark as done
          </button>
        </div>
      )}

      {role === "sitter" && request.status === "completed" && (
        <div className={styles.noticeGood}>
          <strong>Done. Thanks for looking after {request.draft.petName}.</strong>
          <span>Record what you were paid in Earnings. Ratings from owners show up in Completed, without their names.</span>
        </div>
      )}
      {role === "owner" && request.status === "completed" &&
        (request.reviewed ? (
          <div className={styles.noticeGood}>
            <strong>Thanks for your rating.</strong>
          </div>
        ) : (
          <ReviewForm
            sitterName={request.sitterFirstName ?? "your sitter"}
            busy={busy}
            onSubmit={(rating, feedback) => void act(() => rate(request.id, { rating, feedback: feedback.trim() || null }))}
          />
        ))}

      {request.status === "cancelled" && (
        <div className={styles.notice}>{request.mine ? "You cancelled this request." : "The owner cancelled this request."}</div>
      )}

      {role === "owner" && (request.status === "open" || request.status === "matched" || request.status === "agreed") && (
        <BackOut
          label={request.status === "agreed" ? "Cancel this booking" : "Cancel this request"}
          question={
            request.status === "agreed"
              ? `Cancel this booking? ${request.sitterFirstName ?? "Your sitter"} is told right away, so say why.`
              : "Cancel this request? Anyone who offered is told."
          }
          confirm="Yes, cancel"
          busy={busy}
          onConfirm={(reason) => act(() => cancel(request.id, reason))}
        />
      )}
      {role === "sitter" && request.myOffer?.status === "pending" && request.status === "open" && (
        <BackOut
          label="Take back my offer"
          question={`Take back your offer? ${request.ownerFirstName} is told.`}
          confirm="Yes, take it back"
          busy={busy}
          onConfirm={(reason) => act(() => withdraw(request.id, reason))}
        />
      )}
      {role === "sitter" && request.myOffer?.status === "accepted" && (request.status === "matched" || request.status === "agreed") && (
        <BackOut
          label="I can't do this anymore"
          question={`Back out? ${request.ownerFirstName} is told right away and the request opens to other sitters, so say why.`}
          confirm="Yes, back out"
          busy={busy}
          onConfirm={(reason) => act(() => withdraw(request.id, reason))}
        />
      )}

      {!request.mine && <ReportLink kind="request" targetId={request.id} what="this request" />}
    </section>
  );
}

/** A quiet link that asks first, with an optional reason the other person sees. */
function BackOut({ label, question, confirm, busy, onConfirm }: { label: string; question: string; confirm: string; busy: boolean; onConfirm: (reason: string | null) => void }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  if (!asking) {
    return (
      <button type="button" className={styles.link} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className={styles.panelPlain}>
      <span>{question}</span>
      <textarea className={styles.input} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, they'll see it)" aria-label="Reason" />
      <div className={styles.row}>
        <button type="button" className={styles.secondary} onClick={() => setAsking(false)}>
          Keep it
        </button>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => onConfirm(reason.trim() || null)}>
          {confirm}
        </button>
      </div>
    </div>
  );
}

/** Approving shares a phone number, and the address from whoever hosts the care. */
function ApproveForm({
  hostsCare,
  boarding,
  savedPhone,
  busy,
  onApprove,
}: {
  hostsCare: boolean;
  boarding: boolean;
  savedPhone: string | null;
  busy: boolean;
  onApprove: (handoff: { phone: string; address: string | null }) => void;
}) {
  const [phone, setPhone] = useState(savedPhone ?? "");
  const [address, setAddress] = useState("");
  return (
    <form
      className={styles.panelPlain}
      onSubmit={(e) => {
        e.preventDefault();
        onApprove({ phone, address: hostsCare ? address : null });
      }}
    >
      <label htmlFor="pp-phone" className={styles.label}>
        Your phone number
      </label>
      <input id="pp-phone" className={styles.input} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="215 555 0134" />
      {hostsCare && (
        <>
          <label htmlFor="pp-address" className={styles.label}>
            {boarding ? "Your address, for drop-off" : "Address where the care happens"}
          </label>
          <input id="pp-address" className={styles.input} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="3900 Spruce St, Apt 2B" />
        </>
      )}
      <span className={styles.hint}>Only the two of you see these, and only once you've both approved.</span>
      <button type="submit" className={styles.primary} disabled={busy || !phone.trim() || (hostsCare && !address.trim())}>
        Approve and share
      </button>
    </form>
  );
}

function ContactLines({ name, contact }: { name: string; contact: Contact }) {
  return (
    <span>
      <strong>{name}</strong>: {[contact.phone, contact.email, contact.address].filter(Boolean).join(", ") || "no details shared"}
    </span>
  );
}

/** Who the sitter is, so the owner isn't choosing from a first name and a note. */
function SitterCardView({ card }: { card: SitterCard }) {
  const rating =
    card.rating.count === 0
      ? "No ratings yet"
      : `${card.rating.average?.toFixed(1)} out of 5 from ${card.rating.count} ${card.rating.count === 1 ? "owner" : "owners"}`;
  return (
    <dl className={styles.sitterCard}>
      <dt>About</dt>
      <dd className={styles.preLine}>{card.bio}</dd>
      <dt>Offers</dt>
      <dd>{card.services}</dd>
      {card.experience && (
        <>
          <dt>Experience</dt>
          <dd>{card.experience}</dd>
        </>
      )}
      <dt>Track record</dt>
      <dd>
        {card.jobsDone === 0 ? "New to PennPaws" : `${card.jobsDone} ${card.jobsDone === 1 ? "job" : "jobs"} done`}. {rating}.
      </dd>
      <dt>Lives</dt>
      <dd>{card.area}</dd>
    </dl>
  );
}

/** "Report", which opens a short form and sends it to the PennPaws team. */
function ReportLink({ kind, targetId, what }: { kind: "request" | "offer"; targetId: string; what: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]["value"] | null>(null);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") return <p className={styles.hint}>Thanks. The PennPaws team will look into it. The other person isn&apos;t told who reported.</p>;
  if (!open) {
    return (
      <button type="button" className={styles.reportLink} onClick={() => setOpen(true)}>
        Report {what}
      </button>
    );
  }
  const send = async () => {
    if (!reason) return setError("Pick a reason.");
    setState("sending");
    const result = await report({ kind, targetId, reason, details: details.trim() || null });
    if (result.ok) setState("sent");
    else {
      setState("idle");
      setError(result.error);
    }
  };
  return (
    <div className={styles.panel}>
      <p>
        <strong>Report {what}</strong>
      </p>
      <p className={styles.hint}>Only the PennPaws team sees reports. If anyone is in danger, call 911 or Penn Public Safety at 215-573-3333.</p>
      <div className={styles.chips}>
        {REPORT_REASONS.map((r) => (
          <button key={r.value} type="button" className={reason === r.value ? styles.chipOn : styles.chip} aria-pressed={reason === r.value} onClick={() => setReason(r.value)}>
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        className={styles.input}
        rows={3}
        maxLength={500}
        placeholder={reason === "other" ? "What happened?" : "Anything that helps us understand (optional)"}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        aria-label="Details"
      />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.testRow}>
        <button type="button" className={styles.secondary} onClick={() => setOpen(false)} disabled={state === "sending"}>
          Never mind
        </button>
        <button type="button" className={styles.primary} onClick={send} disabled={state === "sending"}>
          {state === "sending" ? "Sending..." : "Send report"}
        </button>
      </div>
    </div>
  );
}

function MatchList({ match }: { match: AskCheck }) {
  return (
    <ul className={styles.matchList}>
      {match.fits.map((fit) => (
        <li key={fit} className={styles.matchFit}>
          ✓ {fit}
        </li>
      ))}
      {match.misses.map((miss) => (
        <li key={miss} className={styles.matchMiss}>
          ✗ {miss}
        </li>
      ))}
    </ul>
  );
}

function ReviewForm({ sitterName, busy, onSubmit }: { sitterName: string; busy: boolean; onSubmit: (rating: number, feedback: string) => void }) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  return (
    <form
      className={styles.panelPlain}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(rating, feedback);
      }}
    >
      <span id="pp-rating" className={styles.label}>
        How did {sitterName} do?
      </span>
      <div className={styles.starPicker} role="radiogroup" aria-labelledby="pp-rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
            className={n <= rating ? styles.starOn : styles.starOff}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <label htmlFor="pp-feedback" className={styles.label}>
        Feedback (optional)
      </label>
      <textarea
        id="pp-feedback"
        className={styles.input}
        rows={3}
        maxLength={500}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Sent a photo after every walk. Mochi loved her."
      />
      <span className={styles.hint}>{sitterName} sees your rating and feedback without your name or which booking it&apos;s about.</span>
      <button type="submit" className={styles.primary} disabled={busy || rating === 0}>
        Send rating
      </button>
    </form>
  );
}

function Term({ label, value, muted = false, changed = false }: { label: string; value: string; muted?: boolean; changed?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={muted ? styles.muted : changed ? styles.termChanged : styles.preLine}>{value}</dd>
    </>
  );
}

function Approval({ name, done, isYou }: { name: string; done: boolean; isYou: boolean }) {
  return (
    <li className={done ? styles.approvalDone : styles.approvalWaiting}>
      <span className={styles.approvalDot}>{done ? <CheckIcon /> : null}</span>
      {isYou ? (done ? "You approved" : "Waiting for you") : done ? `${name} approved` : `Waiting for ${name}`}
    </li>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className={styles.back} onClick={onBack}>
      ← Back
    </button>
  );
}
