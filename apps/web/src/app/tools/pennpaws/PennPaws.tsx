"use client";

// The PennPaws page: browse open requests, post one with the survey, follow
// your own requests and offers, and see notifications. A request opens in
// RequestDetail, where offers, the agreement and approvals happen.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { describe, type Notification, type RequestCard as Card } from "@penntools/tool-pennpaws";
import { readNotifications } from "./actions";
import { RequestDetail } from "./RequestDetail";
import { Survey } from "./Survey";
import styles from "./PennPaws.module.css";

type View = { tab: "find" | "post" | "mine" | "alerts" } | { tab: "request"; id: string; back: "find" | "mine" | "alerts" };

const STATUS_LABELS: Record<Card["status"], string> = {
  open: "Open",
  matched: "Agreement pending",
  agreed: "Booked",
  completed: "Done",
  cancelled: "Cancelled",
};

export function PennPaws({
  userFirstName,
  open,
  mine,
  notifications,
  hasAI,
}: {
  userFirstName: string;
  open: Card[];
  mine: Card[];
  notifications: Notification[];
  hasAI: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>({ tab: "find" });
  const [kind, setKind] = useState<"all" | "dog" | "cat">("all");
  const unread = notifications.filter((n) => !n.read).length;

  const openRequest = (id: string, back: "find" | "mine" | "alerts") => setView({ tab: "request", id, back });
  const showAlerts = async () => {
    setView({ tab: "alerts" });
    if (unread > 0) {
      await readNotifications();
      router.refresh();
    }
  };

  const shown = open.filter((r) => kind === "all" || r.draft.petKind === kind);
  const activeTab = view.tab === "request" ? view.back : view.tab;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.title}>PennPaws</h1>
          <span className={styles.verified}>
            <CheckIcon /> Penn verified
          </span>
        </div>
        <button type="button" className={styles.bell} onClick={showAlerts} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}>
          <BellIcon />
          {unread > 0 && <span className={styles.badge}>{unread}</span>}
        </button>
      </header>

      <nav className={styles.tabs} aria-label="PennPaws">
        {(
          [
            ["find", "Find a request"],
            ["post", "Post a request"],
            ["mine", "My requests"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? styles.tabActive : styles.tab}
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => setView({ tab })}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className={styles.main}>
        {view.tab === "find" && (
          <section className={styles.section}>
            <p className={styles.lead}>Hi {userFirstName}. These Penn students need a hand with their pets.</p>
            <div className={styles.filters} role="group" aria-label="Filter by pet">
              {(
                [
                  ["all", "All"],
                  ["dog", "Dogs"],
                  ["cat", "Cats"],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" className={kind === value ? styles.chipOn : styles.chip} aria-pressed={kind === value} onClick={() => setKind(value)}>
                  {label}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <Empty
                title="No open requests right now"
                body="When someone posts, it shows up here. Going away yourself?"
                action={{ label: "Post a request", onClick: () => setView({ tab: "post" }) }}
              />
            ) : (
              <ul className={styles.list}>
                {shown.map((request) => (
                  <li key={request.id}>
                    <RequestCard request={request} onOpen={() => openRequest(request.id, "find")} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view.tab === "post" && (
          <Survey
            userFirstName={userFirstName}
            hasAI={hasAI}
            onPosted={(id) => {
              router.refresh();
              openRequest(id, "mine");
            }}
          />
        )}

        {view.tab === "mine" && (
          <section className={styles.section}>
            {mine.length === 0 ? (
              <Empty
                title="Nothing here yet"
                body="Requests you post and offers you make show up here."
                action={{ label: "Find a request", onClick: () => setView({ tab: "find" }) }}
              />
            ) : (
              <ul className={styles.list}>
                {mine.map((request) => (
                  <li key={request.id}>
                    <RequestCard request={request} showStatus onOpen={() => openRequest(request.id, "mine")} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view.tab === "alerts" && (
          <section className={styles.section}>
            <h2 className={styles.heading}>Notifications</h2>
            {notifications.length === 0 ? (
              <Empty title="You're all caught up" body="We'll let you know here when someone offers, picks you or approves." />
            ) : (
              <ul className={styles.alerts}>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={n.read ? styles.alert : styles.alertNew}
                      onClick={() => n.requestId && openRequest(n.requestId, "alerts")}
                      disabled={!n.requestId}
                    >
                      <span>{n.message}</span>
                      <time className={styles.muted} dateTime={n.createdAt}>
                        {new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view.tab === "request" && (
          <RequestDetail key={view.id} requestId={view.id} onBack={() => setView({ tab: view.back })} onChanged={() => router.refresh()} />
        )}
      </main>
    </div>
  );
}

export function RequestCard({ request, onOpen, showStatus = false }: { request: Card; onOpen: () => void; showStatus?: boolean }) {
  const lines = describe(request.draft);
  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <span className={styles.cardTop}>
        <PetAvatar name={request.draft.petName} photo={request.draft.photo} />
        <span className={styles.cardName}>
          <strong>{request.draft.petName}</strong>
          <span className={styles.muted}>{lines.pet}</span>
        </span>
        <strong className={styles.pay}>{request.draft.pay}</strong>
      </span>
      <span className={styles.facts}>
        <span className={styles.muted}>When</span>
        <span>{lines.when}</span>
        <span className={styles.muted}>Care</span>
        <span>
          {lines.visits}. {lines.care}
        </span>
        {request.draft.area && (
          <>
            <span className={styles.muted}>Where</span>
            <span>{request.draft.area}</span>
          </>
        )}
      </span>
      <span className={styles.cardFoot}>
        <span className={styles.owner}>
          <CheckIcon /> {request.mine ? "Your request" : `${request.ownerFirstName}, Penn`}
        </span>
        {showStatus ? (
          <span className={request.status === "agreed" ? styles.pillGood : styles.pill}>{STATUS_LABELS[request.status]}</span>
        ) : (
          request.offerCount > 0 && (
            <span className={styles.muted}>
              {request.offerCount} {request.offerCount === 1 ? "offer" : "offers"}
            </span>
          )
        )}
      </span>
    </button>
  );
}

export function PetAvatar({ name, photo, large = false }: { name: string; photo: string | null; large?: boolean }) {
  const className = large ? styles.avatarLarge : styles.avatar;
  // Photos are small data URLs made by the survey, so next/image adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  if (photo) return <img src={photo} alt={`Photo of ${name}`} className={className} />;
  return (
    <span className={className} aria-hidden="true">
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      <p className={styles.muted}>{body}</p>
      {action && (
        <button type="button" className={styles.primary} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
