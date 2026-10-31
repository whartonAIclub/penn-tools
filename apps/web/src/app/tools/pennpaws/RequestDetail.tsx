"use client";

// One request, as the viewer may see it: a sitter can offer to help, the
// owner picks an offer, and both review and approve the care agreement.
// Contacts appear only once both have approved.

import { useCallback, useEffect, useState } from "react";
import { describe, type AgreementTerms, type RequestView } from "@penntools/tool-pennpaws";
import { accept, approve, askForChange, cancel, loadRequest, offer, type ActionResult } from "./actions";
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

export function RequestDetail({ requestId, onBack, onChanged }: { requestId: string; onBack: () => void; onChanged: () => void }) {
  const [request, setRequest] = useState<RequestView | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
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
        <dt>Visits</dt>
        <dd>{lines.visits}</dd>
        <dt>Care</dt>
        <dd>{lines.care}</dd>
        {request.draft.area && (
          <>
            <dt>Where</dt>
            <dd>{request.draft.area}. Exact address once you both approve.</dd>
          </>
        )}
        <dt>Keys</dt>
        <dd>{lines.access}</dd>
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
            placeholder="I grew up with two shibas and I'm free mornings and evenings."
          />
          <button type="submit" className={styles.primary} disabled={busy || !message.trim()}>
            I can help
          </button>
          <span className={styles.hint}>{request.ownerFirstName} sees your first name and this note. Emails are shared only after you both approve.</span>
        </form>
      )}
      {!request.mine && role === null && request.status !== "open" && <p className={styles.muted}>This request already has a sitter.</p>}

      {/* A sitter who offered */}
      {role === "sitter" && request.myOffer?.status === "pending" && (
        <div className={styles.notice}>You offered to help. We'll let you know when {request.ownerFirstName} decides.</div>
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
                <button type="button" className={styles.primary} disabled={busy} onClick={() => void act(() => accept(o.id))}>
                  Choose {o.sitterFirstName}
                </button>
              </div>
            ))
          )}
        </div>
      )}

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
              ) : key === "vet" ? (
                <Term key={key} label={label} value="Add the vet's name and phone with Ask for a change" muted />
              ) : null,
            )}
          </dl>

          <ul className={styles.approvals}>
            <Approval name={request.ownerFirstName} done={agreement.ownerApproved} />
            <Approval name={request.sitterFirstName ?? "Sitter"} done={agreement.sitterApproved} />
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

      {role === "owner" && (request.status === "open" || request.status === "matched") && (
        <button
          type="button"
          className={styles.link}
          disabled={busy}
          onClick={() => void act(() => cancel(request.id))}
        >
          Cancel this request
        </button>
      )}
    </section>
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

function Approval({ name, done }: { name: string; done: boolean }) {
  return (
    <li className={done ? styles.approvalDone : styles.approvalWaiting}>
      <span className={styles.approvalDot}>{done ? <CheckIcon /> : null}</span>
      {done ? `${name} approved` : `Waiting for ${name}`}
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
