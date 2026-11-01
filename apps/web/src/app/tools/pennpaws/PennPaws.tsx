"use client";

// The PennPaws page: browse open requests, post one with the survey, follow
// your own requests and offers, and see notifications. A request opens in
// RequestDetail, where offers, the agreement and approvals happen. My profile
// reopens the first-time setup to change the member's role or answers.
//
// Tabs follow the member's role. Sitters get Find jobs, My tasks, Completed
// and Earnings (SitterViews.tsx); owners and Pet Pals get Find, Post and Mine.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FIT_LABELS, describe, fitOf, requestStart, type Match, type Member, type Notification, type RequestCard as Card, type Review, type SitterJob } from "@penntools/tool-pennpaws";
import { aiMatches, readNotifications, type AIMatch } from "./actions";
import { Onboarding } from "./Onboarding";
import { RequestDetail } from "./RequestDetail";
import { Completed, Earnings, MyTasks } from "./SitterViews";
import { Survey } from "./Survey";
import styles from "./PennPaws.module.css";

type ListTab = "find" | "mine" | "alerts" | "tasks" | "done" | "earnings";
type View = { tab: ListTab | "post" | "profile" } | { tab: "request"; id: string; back: ListTab };

const OWNER_TABS = [
  ["find", "Browse", "Find a request"],
  ["post", "Post", "Post a request"],
  ["mine", "Mine", "My requests"],
] as const;

const SITTER_TABS = [
  ["find", "Jobs", "Find jobs"],
  ["tasks", "Tasks", "My tasks"],
  ["done", "Done", "Completed"],
  ["earnings", "Earned", "Earnings"],
] as const;

const STATUS_LABELS: Record<Card["status"], string> = {
  open: "Open",
  matched: "Agreement pending",
  agreed: "Booked",
  completed: "Done",
  cancelled: "Cancelled",
};

export function PennPaws({
  userFirstName,
  pennVerified,
  email,
  member,
  open,
  matches,
  mine,
  jobs,
  reviews,
  notifications,
  hasAI,
}: {
  userFirstName: string;
  /** False for the local development user, who has no Penn email. */
  pennVerified: boolean;
  email: string | null;
  member: Member;
  open: Card[];
  /** How well each open request fits the sitter, from the rules; empty for other roles. */
  matches: Match[];
  mine: Card[];
  /** The sitter's jobs and anonymous ratings; empty for other roles. */
  jobs: SitterJob[];
  reviews: Review[];
  notifications: Notification[];
  hasAI: boolean;
}) {
  const router = useRouter();
  const isSitter = member.role === "sitter";
  // Owners start with their own requests (or posting one); sitters and Pet Pals start browsing.
  const home: View = { tab: member.role === "owner" ? (mine.length > 0 ? "mine" : "post") : "find" };
  const [view, setView] = useState<View>(home);
  const [kind, setKind] = useState<"all" | "dog" | "cat">("all");
  const unread = notifications.filter((n) => !n.read).length;
  const [aiRanked, setAIRanked] = useState<Record<string, AIMatch> | null>(null);
  const [ranking, setRanking] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);

  const openRequest = (id: string, back: ListTab) => setView({ tab: "request", id, back });
  const showAlerts = async () => {
    setView({ tab: "alerts" });
    if (unread > 0) {
      await readNotifications();
      router.refresh();
    }
  };

  // Sitters only see other people's requests; their own (posted while they were an owner) show in My tasks.
  const filtered = open.filter((r) => (kind === "all" || r.draft.petKind === kind) && !(isSitter && r.mine));
  // Sitters see the best fit first: the AI's score once they've asked for it, else the rules'.
  const matchOf = new Map(matches.map((m) => [m.requestId, m]));
  const scoreOf = (id: string) => aiRanked?.[id]?.score ?? matchOf.get(id)?.score ?? 0;
  const shown = isSitter ? [...filtered].sort((a, b) => scoreOf(b.id) - scoreOf(a.id)) : filtered;
  const rankWithAI = async () => {
    setRanking(true);
    setRankError(null);
    const result = await aiMatches();
    setRanking(false);
    if (result.ok) setAIRanked(result.data);
    else setRankError(result.error);
  };
  const activeTab = view.tab === "request" ? view.back : view.tab;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.title}>PennPaws</h1>
          <span className={pennVerified ? styles.verified : styles.testAccount}>
            {pennVerified && <CheckIcon />} {pennVerified ? "Penn verified" : "Test account"}
          </span>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.profileButton} aria-current={view.tab === "profile" ? "page" : undefined} onClick={() => setView({ tab: "profile" })}>
            My profile
          </button>
          <button type="button" className={styles.bell} onClick={showAlerts} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}>
            <BellIcon />
            {unread > 0 && <span className={styles.badge}>{unread}</span>}
          </button>
        </div>
      </header>

      <nav className={isSitter ? styles.tabs4 : styles.tabs} aria-label="PennPaws">
        {(isSitter ? SITTER_TABS : OWNER_TABS).map(([tab, short, full]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? styles.tabActive : styles.tab}
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => setView({ tab })}
          >
            <span className={styles.tabShort}>{short}</span>
            <span className={styles.tabFull}>{full}</span>
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
            {isSitter && shown.length > 0 && (
              <div className={styles.rankBar}>
                <span className={styles.muted}>
                  {aiRanked ? "Ranked by AI, reading each owner's own words." : "Best fit for your profile first."}
                </span>
                {hasAI && (
                  <button type="button" className={styles.secondary} onClick={rankWithAI} disabled={ranking}>
                    {ranking ? "Ranking..." : aiRanked ? "Rank again" : "Rank with AI"}
                  </button>
                )}
              </div>
            )}
            {rankError && <p className={styles.error}>{rankError}</p>}
            {shown.length === 0 ? (
              isSitter ? (
                <Empty title="No open requests right now" body="When someone posts, it shows up here, and we'll keep your offers in My tasks." />
              ) : (
                <Empty
                  title="No open requests right now"
                  body="When someone posts, it shows up here. Going away yourself?"
                  action={{ label: "Post a request", onClick: () => setView({ tab: "post" }) }}
                />
              )
            ) : (
              <ul className={styles.list}>
                {shown.map((request) => (
                  <li key={request.id}>
                    <RequestCard request={request} match={isSitter ? matchLine(matchOf.get(request.id), aiRanked?.[request.id]) : null} onOpen={() => openRequest(request.id, "find")} />
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
            start={member.profile.role === "owner" ? requestStart(member.profile) : null}
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

        {view.tab === "tasks" && (
          <MyTasks
            jobs={jobs}
            ownRequests={mine.filter((r) => r.mine && (r.status === "open" || r.status === "matched" || r.status === "agreed"))}
            onOpen={(id) => openRequest(id, "tasks")}
            onFind={() => setView({ tab: "find" })}
          />
        )}
        {view.tab === "done" && <Completed jobs={jobs} reviews={reviews} onOpen={(id) => openRequest(id, "done")} onFind={() => setView({ tab: "find" })} />}
        {view.tab === "earnings" && <Earnings jobs={jobs} onOpen={(id) => openRequest(id, "earnings")} />}

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
          <RequestDetail key={view.id} requestId={view.id} hasAI={hasAI} match={matchOf.get(view.id) ?? null} onBack={() => setView({ tab: view.back })} onChanged={() => router.refresh()} />
        )}

        {view.tab === "profile" && (
          <Onboarding userFirstName={userFirstName} email={email} school={member.school} initial={member.profile} onDone={() => setView(home)} />
        )}
      </main>
    </div>
  );
}

export function RequestCard({
  request,
  onOpen,
  showStatus = false,
  pill,
  match = null,
}: {
  request: Card;
  /** Why this request suits the sitter, on Find jobs. */
  match?: MatchLine | null;
  onOpen: () => void;
  showStatus?: boolean;
  /** A label in place of the status, such as "Your turn to approve" in a sitter's tasks. */
  pill?: { text: string; good?: boolean } | undefined;
}) {
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
        {lines.sitter && (
          <>
            <span className={styles.muted}>Sitter</span>
            <span>{lines.sitter}</span>
          </>
        )}
      </span>
      {match && (match.label || match.reason) && (
        <span className={styles.matchLine}>
          {match.label && <strong className={match.good ? styles.fitGood : styles.fitPoor}>{match.label}</strong>}
          {match.reason && <span>{match.reason}</span>}
          {match.concern && <span className={styles.muted}>Check: {match.concern}</span>}
        </span>
      )}
      <span className={styles.cardFoot}>
        <span className={styles.owner}>
          <CheckIcon /> {request.mine ? "Your request" : `${request.ownerFirstName}, Penn`}
        </span>
        {pill ? (
          <span className={pill.good ? styles.pillGood : styles.pill}>{pill.text}</span>
        ) : showStatus ? (
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

export interface MatchLine {
  label: string | null;
  good: boolean;
  reason: string | null;
  concern: string | null;
}

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** What a Find jobs card says about fit: the AI's words when it has ranked, else the rules' top reasons. */
function matchLine(rules: Match | undefined, ai: AIMatch | undefined): MatchLine | null {
  if (ai) {
    const fit = fitOf(ai.score);
    return { label: FIT_LABELS[fit], good: fit !== "poor", reason: ai.reason, concern: ai.concern };
  }
  if (!rules) return null;
  return {
    label: FIT_LABELS[rules.fit],
    good: rules.fit !== "poor",
    reason: rules.reasons.length ? rules.reasons.slice(0, 2).map(sentence).join(" ") : null,
    concern: rules.concerns[0] ?? null,
  };
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

export function Empty({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
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
