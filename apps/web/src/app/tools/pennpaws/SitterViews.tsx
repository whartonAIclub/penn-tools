"use client";

// The sitter's tabs. My tasks: agreements to approve, upcoming bookings and
// offers waiting on owners. Completed: finished jobs and the ratings owners
// left, shown anonymously. Earnings: what the sitter has recorded being paid;
// money moves outside PennPaws. A job opens in RequestDetail, where the
// agreement and Mark as done live.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PAYMENT_METHODS,
  describe,
  earnings,
  groupJobs,
  isoDate,
  labelOf,
  payHint,
  ratingSummary,
  shortDate,
  type PaymentMethod,
  type RequestCard as RequestCardData,
  type Review,
  type SitterJob,
} from "@penntools/tool-pennpaws";
import { removePayment, savePayment, type ActionResult } from "./actions";
import { DateField } from "./DateField";
import { Empty, RequestCard } from "./PennPaws";
import styles from "./PennPaws.module.css";

type Pill = { text: string; good?: boolean };

const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

export function MyTasks({
  jobs,
  ownRequests,
  onOpen,
  onFind,
}: {
  jobs: SitterJob[];
  /** Requests this member posted themselves (as an owner) that are still active. */
  ownRequests: RequestCardData[];
  onOpen: (id: string) => void;
  onFind: () => void;
}) {
  const groups = groupJobs(jobs);
  const own =
    ownRequests.length > 0 ? (
      <>
        <h2 className={styles.heading}>Requests you posted</h2>
        <p className={styles.hint}>From when you used PennPaws as an owner. Open one to see offers and messages, or cancel it.</p>
        <ul className={styles.list}>
          {ownRequests.map((request) => (
            <li key={request.id}>
              <RequestCard request={request} pill={{ text: "Your request" }} onOpen={() => onOpen(request.id)} />
            </li>
          ))}
        </ul>
      </>
    ) : null;
  if (groups.agreements.length + groups.upcoming.length + groups.offered.length === 0) {
    return (
      <section className={styles.section}>
        <Empty
          title="No tasks yet"
          body="Offer to help with a request. It shows up here while the owner decides, and stays here once you're booked."
          action={{ label: "Find jobs", onClick: onFind }}
        />
        {own}
      </section>
    );
  }
  return (
    <section className={styles.section}>
      <JobList
        title="Agreements"
        jobs={groups.agreements}
        onOpen={onOpen}
        pill={(job) => (job.needsMyApproval ? { text: "Your turn to approve" } : { text: "Waiting for the owner" })}
      />
      <JobList title="Upcoming" jobs={groups.upcoming} onOpen={onOpen} pill={() => ({ text: "Booked", good: true })} />
      <JobList title="Waiting on the owner" jobs={groups.offered} onOpen={onOpen} pill={() => ({ text: "Offer sent" })} />
      {own}
    </section>
  );
}

export function Completed({
  jobs,
  reviews,
  onOpen,
  onFind,
}: {
  jobs: SitterJob[];
  reviews: Review[];
  onOpen: (id: string) => void;
  onFind: () => void;
}) {
  const done = groupJobs(jobs).completed;
  const { average, count } = ratingSummary(reviews);
  return (
    <section className={styles.section}>
      <div className={styles.ratingCard}>
        {average === null ? (
          <>
            <strong>No ratings yet</strong>
            <span className={styles.muted}>When a booking is done, the owner can rate it.</span>
          </>
        ) : (
          <>
            <span className={styles.ratingBig}>
              <Stars value={Math.round(average)} /> {average.toFixed(1)}
            </span>
            <span className={styles.muted}>
              From {count} {count === 1 ? "rating" : "ratings"}
            </span>
          </>
        )}
        <span className={styles.hint}>Ratings never show who wrote them or which booking they&apos;re about, so owners can be honest.</span>
      </div>

      {reviews.length > 0 && (
        <>
          <h2 className={styles.heading}>What owners said</h2>
          <ul className={styles.list}>
            {reviews.map((review, i) => (
              // Reviews carry no id on purpose: an id could tie one to its booking.
              <li key={i} className={styles.review}>
                <Stars value={review.rating} />
                {review.feedback && <p className={styles.preLine}>{review.feedback}</p>}
                <span className={styles.muted}>{monthLabel(review.month)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className={styles.heading}>Finished jobs</h2>
      {done.length === 0 ? (
        <Empty title="No finished jobs yet" body="When a booking is marked done, it moves here." action={{ label: "Find jobs", onClick: onFind }} />
      ) : (
        <JobList jobs={done} onOpen={onOpen} pill={(job) => (job.payment ? { text: "Paid", good: true } : { text: "Not paid yet" })} />
      )}
    </section>
  );
}

export function Earnings({ jobs, onOpen }: { jobs: SitterJob[]; onOpen: (id: string) => void }) {
  const totals = earnings(jobs, isoDate(new Date()));
  const groups = groupJobs(jobs);
  const rows = [...groups.completed, ...groups.upcoming];
  return (
    <section className={styles.section}>
      <div className={styles.totals}>
        <Total label="This month" value={money(totals.thisMonth)} />
        <Total label="All time" value={money(totals.total)} />
        <Total label="Jobs done, not paid yet" value={String(totals.unpaid)} />
      </div>
      <p className={styles.hint}>Owners pay you directly, by Venmo, PayPal, Zelle or cash. Record each payment here to keep track.</p>
      {rows.length === 0 ? (
        <Empty title="Nothing to track yet" body="Bookings you're picked for show up here." />
      ) : (
        <ul className={styles.list}>
          {rows.map((job) => (
            <li key={job.request.id}>
              <PaymentRow job={job} onOpen={() => onOpen(job.request.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JobList({ title, jobs, onOpen, pill }: { title?: string; jobs: SitterJob[]; onOpen: (id: string) => void; pill: (job: SitterJob) => Pill }) {
  if (jobs.length === 0) return null;
  return (
    <>
      {title && <h2 className={styles.heading}>{title}</h2>}
      <ul className={styles.list}>
        {jobs.map((job) => (
          <li key={job.request.id}>
            <RequestCard request={job.request} pill={pill(job)} onOpen={() => onOpen(job.request.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function PaymentRow({ job, onOpen }: { job: SitterJob; onOpen: () => void }) {
  const router = useRouter();
  const today = isoDate(new Date());
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(job.payment?.amount ?? payHint(job.request.draft.pay) ?? ""));
  const [method, setMethod] = useState<PaymentMethod>(job.payment?.method ?? "venmo");
  const [paidOn, setPaidOn] = useState(job.payment?.paidOn ?? today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { draft } = job.request;
  const done = job.request.status === "completed";

  const act = async (fn: () => Promise<ActionResult>) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  };

  return (
    <div className={styles.earningRow}>
      <div className={styles.earningTop}>
        <button type="button" className={styles.earningPet} onClick={onOpen}>
          <strong>{draft.petName}</strong>
          <span className={styles.muted}>
            {describe(draft).when}. Agreed: {draft.pay}
          </span>
        </button>
        {job.payment ? (
          <span className={styles.pillGood}>{money(job.payment.amount)}</span>
        ) : (
          <span className={styles.pill}>{done ? "Not paid yet" : "Upcoming"}</span>
        )}
      </div>

      {job.payment && !editing && (
        <span className={styles.muted}>
          Paid by {labelOf(PAYMENT_METHODS, job.payment.method)} on {shortDate(job.payment.paidOn)}
        </span>
      )}

      {editing ? (
        <form
          className={styles.stack}
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => savePayment(job.request.id, { amount: Number(amount), method, paidOn }));
          }}
        >
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Amount ($)</span>
              <input
                className={styles.input}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <DateField id="pp-paid-on" label="Paid on" value={paidOn} max={today} onChange={setPaidOn} />
          </div>
          <div className={styles.chips} role="group" aria-label="Paid with">
            {PAYMENT_METHODS.map((m) => (
              <button key={m.value} type="button" className={method === m.value ? styles.chipOn : styles.chip} aria-pressed={method === m.value} onClick={() => setMethod(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className={styles.row}>
            <button type="button" className={styles.secondary} onClick={() => setEditing(false)}>
              Never mind
            </button>
            <button type="submit" className={styles.primary} disabled={busy}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.rowActions}>
          <button type="button" className={job.payment ? styles.link : styles.secondary} onClick={() => setEditing(true)}>
            {job.payment ? "Edit" : "Record payment"}
          </button>
          {job.payment && (
            <button type="button" className={styles.link} disabled={busy} onClick={() => void act(() => removePayment(job.request.id))}>
              Remove
            </button>
          )}
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.total}>
      <span className={styles.muted}>{label}</span>
      <strong className={styles.totalValue}>{value}</strong>
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className={styles.stars} role="img" aria-label={`${value} out of 5 stars`}>
      {"★".repeat(value)}
      <span className={styles.starsOff}>{"★".repeat(5 - value)}</span>
    </span>
  );
}
