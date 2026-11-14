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
import {
  FIT_LABELS,
  describe,
  fitOf,
  isFinished,
  oppositeRole,
  requestStart,
  stillToDo,
  type Match,
  type Member,
  type Notification,
  type Pet,
  type PlatformRates,
  type RequestCard as Card,
  type Review,
  type SitterJob,
} from "@penntools/tool-pennpaws";
import { aiMatches, readNotifications, switchSide, type AIMatch } from "./actions";
import { MyPets } from "./MyPets";
import { Circled, Hero, PHOTOS } from "./Hero";
import { Onboarding } from "./Onboarding";
import { RequestDetail } from "./RequestDetail";
import { Completed, Earnings, MyTasks } from "./SitterViews";
import { Survey } from "./Survey";
import { TeamView } from "./TeamView";
import styles from "./PennPaws.module.css";

type ListTab = "find" | "mine" | "pets" | "alerts" | "tasks" | "done" | "earnings";
type View = { tab: ListTab | "post" | "profile" | "team" } | { tab: "request"; id: string; back: ListTab };

// Only sitters browse open requests; owners post and follow their own.
const OWNER_TABS = [
  ["post", "Post", "Post a request"],
  ["mine", "Mine", "My requests"],
  ["done", "Done", "Completed"],
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
  pets,
  rates,
  jobs,
  reviews,
  notifications,
  hasAI,
  isTeam,
  paused,
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
  /** The owner's saved pets; empty for other roles. */
  pets: Pet[];
  /** What members here have asked to pay, for the pay step's suggestion. */
  rates: PlatformRates;
  /** The sitter's jobs and anonymous ratings; empty for other roles. */
  jobs: SitterJob[];
  reviews: Review[];
  notifications: Notification[];
  hasAI: boolean;
  /** The PennPaws team, who get the Team view. */
  isTeam: boolean;
  /** Paused by the team: they can look around but not post, offer or message. */
  paused: boolean;
}) {
  const router = useRouter();
  const isSitter = member.role === "sitter";
  const isOwner = member.role === "owner";
  // Only the requests this person posted. Anything they offered on belongs to
  // the sitter tabs, so someone who switches role doesn't find other people's
  // pets listed under My requests.
  const posted = mine.filter((r) => r.mine);
  // A booking is only finished once it's done, paid and rated (R46). Anything
  // still waiting on one of those stays in My requests, where it's visible.
  const running = posted.filter((r) => !isFinished(r));
  const finished = posted.filter((r) => isFinished(r));
  // Owners start with their own requests (or posting one); sitters and Pet Pals start browsing.
  const homeFor = (role: Member["role"]): View => (role === "sitter" ? { tab: "find" } : posted.length > 0 ? { tab: "mine" } : { tab: "post" });
  const home = homeFor(member.role);
  const [view, setView] = useState<View>(home);
  const [switching, setSwitching] = useState(false);
  // Set when someone switches to a side they have no answers for yet: My
  // profile then opens that side's setup instead of their current answers.
  const [setupRole, setSetupRole] = useState<Member["role"] | null>(null);
  const [kind, setKind] = useState<"all" | "dog" | "cat">("all");
  const unread = notifications.filter((n) => !n.read).length;
  const [aiRanked, setAIRanked] = useState<Record<string, AIMatch> | null>(null);
  const [ranking, setRanking] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);

  const openRequest = (id: string, back: ListTab) => setView({ tab: "request", id, back });
  /** Moves to the other side, or opens its setup the first time they go there. */
  const switchSides = async () => {
    setSwitching(true);
    const result = await switchSide();
    setSwitching(false);
    if (!result.ok) return;
    if (result.data === null) {
      setSetupRole(oppositeRole(member.role));
      setView({ tab: "profile" });
      return;
    }
    setView(homeFor(result.data));
    router.refresh();
  };
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
  // Who the hero talks about: the owner's own pets, by name, and the first one with a photo.
  const petNames = pets.map((p) => p.name);
  const petsLabel = petNames.length === 0 ? "your pet" : petNames.length <= 2 ? petNames.join(" and ") : "your pets";
  const heroPet = pets.find((p) => p.photo) ?? null;

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
          {/* One account, two sides. Switching here is how someone who looks
              after pets gets back to their own, instead of meeting their own
              request in the list of jobs. */}
          <button
            type="button"
            className={styles.switchButton}
            onClick={switchSides}
            disabled={switching}
            title={`Switch to ${isSitter ? "your own pets" : "looking after pets"}`}
          >
            <SwitchIcon />
            <span className={styles.switchLabel}>{switching ? "Switching…" : isSitter ? "My pets side" : "Sitting side"}</span>
          </button>
          {isTeam && (
            <button type="button" className={styles.profileButton} aria-current={view.tab === "team" ? "page" : undefined} onClick={() => setView({ tab: "team" })}>
              Team
            </button>
          )}
          {/* An owner's pets are what they keep up to date, so the corner
              opens those; their own details are a link inside it. */}
          {isOwner ? (
            <button type="button" className={styles.profileButton} aria-current={view.tab === "pets" ? "page" : undefined} onClick={() => setView({ tab: "pets" })}>
              My Pets
            </button>
          ) : (
            <button type="button" className={styles.profileButton} aria-current={view.tab === "profile" ? "page" : undefined} onClick={() => setView({ tab: "profile" })}>
              My profile
            </button>
          )}
          <button type="button" className={styles.bell} onClick={showAlerts} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}>
            <BellIcon />
            {unread > 0 && <span className={styles.badge}>{unread}</span>}
          </button>
        </div>
      </header>

      {/* The welcome band sits on the lists, not inside a request or a form someone is filling in. */}
      {(view.tab === "post" || view.tab === "mine" || view.tab === "find" || view.tab === "tasks") &&
        (isSitter ? (
          <Hero
            title={
              <>
                Spend time with <Circled>pets</Circled> who need you, right near campus.
              </>
            }
            lead="Pick jobs that fit your week, meet the owner, and get paid after every visit."
            photo={PHOTOS.sitterBench}
            photoAlt="A sitter petting a happy beagle at a dog park"
          />
        ) : (
          <Hero
            title={
              <>
                Loving care for <Circled>{petsLabel}</Circled> from Penn students nearby.
              </>
            }
            lead="Post once. Verified students who fit your pet offer to help, and you choose who you trust."
            photo={heroPet?.photo ?? PHOTOS.ownerHug}
            photoAlt={heroPet?.photo ? `Photo of ${heroPet.name}` : "A woman hugging her happy dog in a park"}
          />
        ))}

      <nav className={isSitter ? styles.tabs4 : styles.tabs2} aria-label="PennPaws">
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
        {paused && (
          <p className={styles.pausedNotice}>
            Your account is paused while the PennPaws team looks into a report. You can look around, but you can&apos;t post, offer or message for now.
          </p>
        )}
        {view.tab === "team" && isTeam && <TeamView onOpenRequest={(id) => openRequest(id, isSitter ? "find" : "mine")} />}
        {view.tab === "find" && isSitter && (
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
            pets={pets}
            profile={member.profile.role === "owner" ? member.profile : null}
            rates={rates}
            onPosted={(id) => {
              router.refresh();
              openRequest(id, "mine");
            }}
          />
        )}

        {view.tab === "mine" && (
          <section className={styles.section}>
            {running.length === 0 ? (
              <Empty
                title="Nothing here yet"
                body="Requests you post show up here, with every offer you get."
                action={{ label: "Post a request", onClick: () => setView({ tab: "post" }) }}
              />
            ) : (
              <ul className={styles.list}>
                {running.map((request) => (
                  <li key={request.id}>
                    <RequestCard request={request} showStatus onOpen={() => openRequest(request.id, "mine")} />
                    {stillToDo(request).map((step) => (
                      <span key={step} className={styles.hint}>
                        {step}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view.tab === "done" && !isSitter && (
          <section className={styles.section}>
            {finished.length === 0 ? (
              <Empty title="Nothing finished yet" body="A booking moves here once it's done, your sitter has recorded the payment, and you've rated them." />
            ) : (
              <ul className={styles.list}>
                {finished.map((request) => (
                  <li key={request.id}>
                    <RequestCard request={request} showStatus onOpen={() => openRequest(request.id, "done")} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view.tab === "pets" && <MyPets pets={pets} onChanged={() => router.refresh()} onProfile={() => setView({ tab: "profile" })} />}

        {view.tab === "tasks" && <MyTasks jobs={jobs} onOpen={(id) => openRequest(id, "tasks")} onFind={() => setView({ tab: "find" })} />}
        {view.tab === "done" && isSitter && <Completed jobs={jobs} reviews={reviews} onOpen={(id) => openRequest(id, "done")} onFind={() => setView({ tab: "find" })} />}
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
          <Onboarding
            name={member.name}
            email={email}
            school={member.school}
            initial={member.profile}
            {...(setupRole ? { startRole: setupRole } : {})}
            onDone={(saved) => {
              // Cancelling a new side's setup leaves them on the side they were on.
              const role = saved ? setupRole : null;
              setSetupRole(null);
              setView(homeFor(role ?? member.role));
            }}
          />
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
        <PetAvatar name={request.draft.petName} photo={request.draft.photo} kind={request.draft.petKind} />
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

/**
 * A pet's headshot: their photo, or until there is one, a hand-drawn sketch
 * of a cat or a dog (a paw for anything else), so every card has a face.
 */
export function PetAvatar({ name, photo, kind = null, large = false }: { name: string; photo: string | null; kind?: string | null; large?: boolean }) {
  const className = large ? styles.avatarLarge : styles.avatar;
  // Photos are small data URLs made by the survey, so next/image adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  if (photo) return <img src={photo} alt={`Photo of ${name}`} className={className} />;
  return (
    <span className={`${className} ${styles.avatarSketch}`} role="img" aria-label={`Sketch of ${kind === "cat" ? "a cat" : kind === "dog" || kind === "several" ? "a dog" : "a paw"} for ${name}`}>
      <PetSketch kind={kind} />
    </span>
  );
}

/** Chubby line drawings in the house ink: round faces, big shiny eyes, rosy cheeks. */
function PetSketch({ kind }: { kind: string | null }) {
  if (kind === "cat") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M13 30 C11.5 20 12.5 11 15 8.5 C18 9 24 13.5 27 17.5" className={styles.sketchHead} />
        <path d="M51 30 C52.5 20 51.5 11 49 8.5 C46 9 40 13.5 37 17.5" className={styles.sketchHead} />
        <path d="M16.5 13.5 C16 17 16.2 20 17 22.5 M47.5 13.5 C48 17 47.8 20 47 22.5" className={styles.sketchSoft} />
        <path d="M8.5 38 C8 25 18 16.5 32 16.5 C46 16.5 56 25 55.5 38 C55 50 45 57 32 57 C19 57 9 50 8.5 38 Z" className={styles.sketchHead} />
        <ellipse cx="17.5" cy="44" rx="4.2" ry="2.8" className={styles.sketchCheek} />
        <ellipse cx="46.5" cy="44" rx="4.2" ry="2.8" className={styles.sketchCheek} />
        <circle cx="23" cy="36" r="4.4" className={styles.sketchFill} />
        <circle cx="41" cy="36" r="4.4" className={styles.sketchFill} />
        <circle cx="24.6" cy="34.4" r="1.5" className={styles.sketchShine} />
        <circle cx="42.6" cy="34.4" r="1.5" className={styles.sketchShine} />
        <path d="M30 42.2 C30 41.2 34 41.2 34 42.2 C34 43.2 32 44.4 32 44.4 C32 44.4 30 43.2 30 42.2 Z" className={styles.sketchNose} />
        <path d="M32 44.4 C31.2 47.4 27.8 47.6 27 45.4 M32 44.4 C32.8 47.4 36.2 47.6 37 45.4" />
        <path d="M13 41 L3.5 39 M13 44.5 L4 46.5 M51 41 L60.5 39 M51 44.5 L60 46.5" className={styles.sketchSoft} />
      </svg>
    );
  }
  if (kind === "dog" || kind === "several") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M11 37 C11 23 19 15.5 32 15.5 C45 15.5 53 23 53 37 C53 49.5 44 57 32 57 C20 57 11 49.5 11 37 Z" className={styles.sketchHead} />
        <path d="M17 19 C9.5 15.5 3 24 4 35.5 C4.6 42.5 10.5 43.5 13.5 37.5 C15 33 15.5 25 17 19 Z" className={styles.sketchEar} />
        <path d="M47 19 C54.5 15.5 61 24 60 35.5 C59.4 42.5 53.5 43.5 50.5 37.5 C49 33 48.5 25 47 19 Z" className={styles.sketchEar} />
        <path d="M40 18.5 C44.5 21 46.5 26 45.5 30.5" className={styles.sketchSpot} />
        <ellipse cx="18.5" cy="44.5" rx="3.8" ry="2.6" className={styles.sketchCheek} />
        <ellipse cx="45.5" cy="44.5" rx="3.8" ry="2.6" className={styles.sketchCheek} />
        <circle cx="24" cy="35" r="4.2" className={styles.sketchFill} />
        <circle cx="40" cy="35" r="4.2" className={styles.sketchFill} />
        <circle cx="25.5" cy="33.5" r="1.4" className={styles.sketchShine} />
        <circle cx="41.5" cy="33.5" r="1.4" className={styles.sketchShine} />
        <path d="M27.5 41.8 C27.5 39.3 36.5 39.3 36.5 41.8 C36.5 44 32 45.6 32 45.6 C32 45.6 27.5 44 27.5 41.8 Z" className={styles.sketchFill} />
        <path d="M29.2 49 C29.2 53.5 34.8 53.5 34.8 49 Z" className={styles.sketchTongue} />
        <path d="M32 45.6 L32 48.2 M32 48.2 C30 50.6 26.4 50.2 25.2 47.6 M32 48.2 C34 50.6 37.6 50.2 38.8 47.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="17" cy="27" rx="5.6" ry="7.2" className={styles.sketchHead} />
      <ellipse cx="27" cy="16.5" rx="5.6" ry="7.2" className={styles.sketchHead} />
      <ellipse cx="38.5" cy="16.5" rx="5.6" ry="7.2" className={styles.sketchHead} />
      <ellipse cx="48" cy="27.5" rx="5.6" ry="7.2" className={styles.sketchHead} />
      <path d="M32.5 31 C23.5 31 16.5 40.5 16.6 47.2 C16.7 52.2 20.6 54.6 24.6 54.4 C27.8 54.2 29.6 52.6 32.5 52.6 C35.4 52.6 37.2 54.2 40.4 54.4 C44.4 54.6 48.3 52.2 48.4 47.2 C48.5 40.5 41.5 31 32.5 31 Z" className={styles.sketchHead} />
      <ellipse cx="25.5" cy="45" rx="3" ry="2" className={styles.sketchCheek} />
      <ellipse cx="39.5" cy="45" rx="3" ry="2" className={styles.sketchCheek} />
    </svg>
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

/** Two arrows swapping places: the one account's two sides. */
function SwitchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
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
