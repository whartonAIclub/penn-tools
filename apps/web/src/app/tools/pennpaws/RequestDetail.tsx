"use client";

// One request, as the viewer may see it: a sitter can ask the owner questions
// and accept the job, the owner replies and picks one sitter from everyone who
// accepted, and both review and approve the care agreement.
// Contacts appear only once both have approved. Either person marks the
// booking done, then the owner can rate it; the sitter sees ratings only
// anonymously, in Completed.

import { useCallback, useEffect, useState } from "react";
import { FIT_LABELS, describe, type AgreementTerms, type AskCheck, type Match } from "@penntools/tool-pennpaws";
import { accept, approve, askForChange, cancel, loadRequest, markDone, offer, rate, type ActionResult, type RequestPage } from "./actions";
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
  const [message, setMessage] = useState("");
  const [change, setChange] = useState("");
  const [changing, setChanging] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

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

      {/* A sitter who hasn't offered yet */}
      {!request.mine && role === null && request.status === "open" && (
        <form
          className={styles.panelPlain}
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => offer(request.id, message));
          }}
        >
          <label htmlFor="pp-offer" className={styles.label}>
            Tell {request.ownerFirstName} a little about you
          </label>
          <textarea
            id="pp-offer"
            className={styles.input}
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="I have pets at home, live nearby and I'm free mornings and evenings."
          />
          <button type="submit" className={styles.primary} disabled={busy || !message.trim()}>
            Accept this job
          </button>
          <span className={styles.hint}>
            {request.ownerFirstName} picks one sitter from everyone who accepts, and sees your first name and this note. Emails are shared only after you both
            approve. Questions first? Message {request.ownerFirstName} below.
          </span>
        </form>
      )}
      {!request.mine && role === null && request.status !== "open" && <p className={styles.muted}>This request already has a sitter.</p>}

      {/* A sitter who offered */}
      {role === "sitter" && request.myOffer?.status === "pending" && (
        <div className={styles.notice}>You accepted this job. We'll let you know when {request.ownerFirstName} picks a sitter.</div>
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
                <p className={styles.preLine}>{o.message}</p>
                {o.match && <MatchList match={o.match} />}
                <button type="button" className={styles.primary} disabled={busy} onClick={() => void act(() => accept(o.id))}>
                  Choose {o.sitterFirstName}
                </button>
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
                <Term key={key} label={label} value={agreement.terms[key]!} />
              ) : key === "vet" && request.status === "matched" ? (
                <Term key={key} label={label} value="Add the vet's name and phone with Ask for a change" muted />
              ) : null,
            )}
          </dl>

          <ul className={styles.approvals}>
            <Approval name={request.ownerFirstName} done={agreement.ownerApproved} isYou={role === "owner"} />
            <Approval name={request.sitterFirstName ?? "Sitter"} done={agreement.sitterApproved} isYou={role === "sitter"} />
          </ul>

          {request.status === "matched" && !changing && (
            <div className={styles.row}>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => setChanging(true)}>
                Ask for a change
              </button>
              {!myApproval && (
                <button type="button" className={styles.primary} disabled={busy} onClick={() => void act(() => approve(request.id, agreement.version))}>
                  Approve
                </button>
              )}
            </div>
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
          <span>Reach each other directly to sort out the last details.</span>
          <span>
            {request.ownerFirstName}: {request.contacts.owner ?? "email not available"}
          </span>
          <span>
            {request.sitterFirstName}: {request.contacts.sitter ?? "email not available"}
          </span>
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

      {role === "owner" && (request.status === "open" || request.status === "matched") &&
        (confirmingCancel ? (
          <div className={styles.panelPlain}>
            <span>Cancel this request? Anyone who offered will be told.</span>
            <div className={styles.row}>
              <button type="button" className={styles.secondary} onClick={() => setConfirmingCancel(false)}>
                Keep it
              </button>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => void act(() => cancel(request.id))}>
                Yes, cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.link} onClick={() => setConfirmingCancel(true)}>
            Cancel this request
          </button>
        ))}
    </section>
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

function Term({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={muted ? styles.muted : styles.preLine}>{value}</dd>
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
