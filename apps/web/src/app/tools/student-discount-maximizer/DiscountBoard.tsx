"use client";

// The deal board: filters, deal cards with votes, the Expired section and the
// Add a deal pop-up. Every change goes through a server action in actions.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AIProvider } from "@penntools/core/ai";
import {
  compareDeals,
  matchesFilters,
  type Discount,
  type DiscountAudience,
  type DiscountCategory,
  type DiscountKind,
  type DiscountScope,
  type DiscountPage,
  type Neighborhood,
} from "@penntools/tool-student-discount-maximizer/discounts";
import { castVote, expireDeal, loadDiscounts, restoreDeal, type ActionResult, type Filters } from "./actions";
import { AddDiscountForm, type DealTypeOption, type FormLimits } from "./AddDiscountForm";
import { callAction } from "./callAction";
import styles from "./DiscountBoard.module.css";

export interface Option<T extends string> {
  value: T;
  label: string;
}

const AUDIENCES: { value: DiscountAudience | null; label: string }[] = [
  { value: null, label: "All deals" },
  { value: "penn", label: "Penn-specific" },
  { value: "general", label: "General" },
];

const SIGN_IN_HINT = "Sign in with the button at the top right to vote, add deals or mark them expired.";

/** A YYYY-MM-DD date as the student's locale writes it, read as a calendar day (no time zone shift). */
function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString();
}

/** The Expired section lists every expired deal, newest first. */
const EXPIRED_FILTERS: Filters = {
  status: "expired",
  kind: null,
  scope: null,
  category: null,
  audience: null,
  neighborhood: null,
  search: "",
  sort: "new",
};

/** `more` added after `deals`, leaving out any already there (the list can shift between pages). */
function appendNew(deals: Discount[], more: Discount[]): Discount[] {
  const seen = new Set(deals.map((d) => d.id));
  return [...deals, ...more.filter((d) => !seen.has(d.id))];
}

export function DiscountBoard({
  initialPage,
  signedIn,
  providers,
  providerLabels,
  kinds,
  scopes,
  categories,
  neighborhoods,
  dealTypes,
  limits,
  defaultAddedBy,
}: {
  /** The first page of active deals, A–Z. */
  initialPage: DiscountPage;
  signedIn: boolean;
  /** Providers the student has saved AI keys for; empty when signed out or none. */
  providers: AIProvider[];
  providerLabels: Record<AIProvider, string>;
  kinds: Option<DiscountKind>[];
  scopes: Option<DiscountScope>[];
  categories: Option<DiscountCategory>[];
  /** In the order local spots are grouped. */
  neighborhoods: Option<Neighborhood>[];
  dealTypes: DealTypeOption[];
  limits: FormLimits;
  /** The signed-in student's name, for the form's Added by field. */
  defaultAddedBy: string;
}) {
  const [deals, setDeals] = useState(initialPage.deals);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [kind, setKind] = useState<DiscountKind | null>(null);
  const [scope, setScope] = useState<DiscountScope | null>(null);
  const [category, setCategory] = useState<DiscountCategory | null>(null);
  const [neighborhood, setNeighborhood] = useState<Neighborhood | null>(null);
  const [audience, setAudience] = useState<DiscountAudience | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Filters["sort"]>("az");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const closeAdd = useCallback(() => setAdding(false), []);
  const [expired, setExpired] = useState<Discount[] | null>(null);
  const [expiredHasMore, setExpiredHasMore] = useState(false);
  const [showExpired, setShowExpired] = useState(false);

  const filters: Filters = { status: "active", kind, scope, category, audience, neighborhood, search, sort };

  const kindLabels = Object.fromEntries(kinds.map((k) => [k.value, k.label])) as Record<DiscountKind, string>;
  const scopeLabels = Object.fromEntries(scopes.map((sc) => [sc.value, sc.label])) as Record<DiscountScope, string>;
  const categoryLabels = Object.fromEntries(categories.map((c) => [c.value, c.label])) as Record<DiscountCategory, string>;
  const neighborhoodLabels = Object.fromEntries(neighborhoods.map((n) => [n.value, n.label])) as Record<Neighborhood, string>;

  const activeCard = (deal: Discount) => (
    <DealCard
      key={deal.id}
      deal={deal}
      kindLabels={deal.kinds.map((k) => kindLabels[k])}
      scopeLabel={scopeLabels[deal.scope]}
      categoryLabel={categoryLabels[deal.category]}
      neighborhoodLabel={deal.neighborhood ? neighborhoodLabels[deal.neighborhood] : null}
      signedIn={signedIn}
      onVote={(works) => act(() => castVote(deal.id, works))}
      onExpire={() => {
        if (confirm(`Move "${deal.business}: ${deal.title ?? deal.summary}" to Expired?`)) void act(() => expireDeal(deal.id));
      }}
    />
  );

  // Reload when the filters change, waiting for typing to pause; only the
  // latest request's answer is shown.
  const latest = useRef(0);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await callAction(() =>
        loadDiscounts({ status: "active", kind, scope, category, audience, neighborhood, search, sort }),
      );
      if (request !== latest.current) return;
      setLoading(false);
      if (result.ok) {
        setDeals(result.data.deals);
        setHasMore(result.data.hasMore);
        setError(null);
      } else {
        setError(result.error.message);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [kind, scope, category, audience, neighborhood, search, sort]);

  async function loadMore() {
    const request = latest.current;
    setLoadingMore(true);
    const result = await callAction(() => loadDiscounts(filters, deals.length));
    setLoadingMore(false);
    // The filters changed while this page loaded: it belongs to the old list.
    if (request !== latest.current) return;
    if (result.ok) {
      setDeals((current) => appendNew(current, result.data.deals));
      setHasMore(result.data.hasMore);
      setError(null);
    } else {
      setError(result.error.message);
    }
  }

  async function loadExpired(offset: number) {
    const result = await callAction(() => loadDiscounts(EXPIRED_FILTERS, offset));
    if (result.ok) {
      setExpired((current) => appendNew(offset > 0 ? (current ?? []) : [], result.data.deals));
      setExpiredHasMore(result.data.hasMore);
    } else {
      setError(result.error.message);
    }
  }

  function toggleExpired() {
    // Loaded once: applyChange keeps it up to date after that.
    if (!showExpired && expired === null) void loadExpired(0);
    setShowExpired(!showExpired);
  }

  /**
   * Applies a changed deal: it moves between the active list and Expired as
   * its status says. In the active list it shows only if it matches the
   * filters, in its place in the sort order.
   */
  function applyChange(deal: Discount) {
    setDeals((current) => {
      const rest = current.filter((d) => d.id !== deal.id);
      if (!matchesFilters(deal, filters)) return rest;
      const at = current.findIndex((d) => d.id === deal.id);
      // Already on screen: update it in place, so it doesn't jump away after a vote.
      if (at >= 0) return current.map((d) => (d.id === deal.id ? deal : d));
      const before = rest.findIndex((d) => compareDeals(deal, d, sort) < 0);
      // Sorts after everything loaded: it'll come with "Load more", if there is more.
      if (before < 0) return hasMore ? rest : [...rest, deal];
      return [...rest.slice(0, before), deal, ...rest.slice(before)];
    });
    setExpired((current) => {
      if (current === null) return null;
      const rest = current.filter((d) => d.id !== deal.id);
      return deal.status === "expired" ? [deal, ...rest] : rest;
    });
  }

  async function act(action: () => Promise<ActionResult<Discount>>) {
    const result = await callAction(action);
    if (result.ok) {
      applyChange(result.data);
      setError(null);
    } else {
      setError(result.error.message);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Student Discount Central</h1>
          <p className={styles.intro}>
            Student deals for Penn students: general student discounts, Wharton discounts and local Philly spots, with
            promo codes, online student pricing and in-person deals. Vote on whether a deal still works; deals most
            students say are dead, or past their end date, move to Expired.
          </p>
        </div>
        {signedIn && (
          <button className={styles.button} onClick={() => setAdding(true)}>
            Add a deal
          </button>
        )}
      </div>

      {!signedIn && <p className={styles.hint}>{SIGN_IN_HINT}</p>}

      {adding && (
        <AddDiscountForm
          providers={providers}
          providerLabels={providerLabels}
          scopes={scopes}
          dealTypes={dealTypes}
          categories={categories}
          neighborhoods={neighborhoods}
          limits={limits}
          defaultAddedBy={defaultAddedBy}
          onAdded={(deal) => {
            applyChange(deal);
            setAdding(false);
          }}
          onClose={closeAdd}
        />
      )}

      <div className={styles.filters}>
        <div className={styles.segmented} role="tablist" aria-label="Who the deal is for">
          {AUDIENCES.map((a) => (
            <button
              key={a.label}
              role="tab"
              aria-selected={audience === a.value}
              className={audience === a.value ? styles.segmentActive : styles.segment}
              onClick={() => setAudience(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Kind of deal">
          {[{ value: null, label: "All" }, ...kinds].map((k) => (
            <button
              key={k.label}
              role="tab"
              aria-selected={kind === k.value}
              className={kind === k.value ? styles.tabActive : styles.tab}
              onClick={() => {
                setKind(k.value);
                if (k.value !== "local") setNeighborhood(null);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className={styles.row}>
          <input
            className={styles.input}
            type="search"
            aria-label="Search deals"
            placeholder="Search by business, deal or place"
            value={search}
            maxLength={limits.search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={styles.select}
            aria-label="Type of discount"
            value={scope ?? ""}
            onChange={(e) => setScope((e.target.value || null) as DiscountScope | null)}
          >
            <option value="">All types</option>
            {scopes.map((sc) => (
              <option key={sc.value} value={sc.value}>
                {sc.label}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            aria-label="Category"
            value={category ?? ""}
            onChange={(e) => setCategory((e.target.value || null) as DiscountCategory | null)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            aria-label="Sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Filters["sort"])}
          >
            <option value="az">A–Z</option>
            <option value="top">Most trusted</option>
            <option value="new">Newest</option>
          </select>
        </div>
        {kind === "local" && (
          <select
            className={styles.select}
            aria-label="Neighborhood"
            value={neighborhood ?? ""}
            onChange={(e) => setNeighborhood((e.target.value || null) as Neighborhood | null)}
          >
            <option value="">All neighborhoods</option>
            {neighborhoods.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.list} aria-busy={loading}>
        {deals.length === 0 && !loading && <p className={styles.empty}>No deals match. Try other filters.</p>}
        {kind === "local"
          ? // Local spots are grouped by neighborhood, campus first; spots without one come last.
            [...neighborhoods, { value: null, label: "Neighborhood not given" }].map((n) => {
              const here = deals.filter((d) => d.neighborhood === n.value);
              return (
                here.length > 0 && (
                  <section key={n.value ?? "none"} className={styles.group}>
                    <h2 className={styles.groupTitle}>{n.label}</h2>
                    {here.map(activeCard)}
                  </section>
                )
              );
            })
          : deals.map(activeCard)}
      </div>
      {hasMore && (
        <div className={styles.loadMore}>
          <p className={styles.meta}>Showing the first {deals.length} deals. Search or filter to narrow them down.</p>
          <button className={styles.smallButton} disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      <section className={styles.expiredSection}>
        <button className={styles.linkButton} onClick={toggleExpired} aria-expanded={showExpired}>
          {showExpired ? "Hide expired deals" : "Show expired deals"}
        </button>
        {showExpired && (
          <div className={styles.list}>
            {expired === null && <p className={styles.empty}>Loading…</p>}
            {expired?.length === 0 && <p className={styles.empty}>No expired deals.</p>}
            {expired?.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                kindLabels={deal.kinds.map((k) => kindLabels[k])}
                scopeLabel={scopeLabels[deal.scope]}
                categoryLabel={categoryLabels[deal.category]}
                neighborhoodLabel={deal.neighborhood ? neighborhoodLabels[deal.neighborhood] : null}
                signedIn={signedIn}
                onRestore={() => act(() => restoreDeal(deal.id))}
              />
            ))}
            {expiredHasMore && expired && (
              <button className={styles.smallButton} onClick={() => void loadExpired(expired.length)}>
                Load more
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DealCard({
  deal,
  kindLabels,
  scopeLabel,
  categoryLabel,
  neighborhoodLabel,
  signedIn,
  onVote,
  onExpire,
  onRestore,
}: {
  deal: Discount;
  /** One per way the deal is used. */
  kindLabels: string[];
  scopeLabel: string;
  categoryLabel: string;
  neighborhoodLabel: string | null;
  signedIn: boolean;
  onVote?: (works: boolean | null) => Promise<void>;
  onExpire?: () => void;
  onRestore?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const expired = deal.status === "expired";

  async function busyWhile(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!deal.code) return;
    try {
      await navigator.clipboard.writeText(deal.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  // Voting the same way again takes the vote back.
  const voteFor = (works: boolean) => onVote && busyWhile(() => onVote(deal.myVote === works ? null : works));

  return (
    <article className={expired ? styles.cardExpired : styles.card}>
      <div className={styles.cardTop}>
        <span className={styles.business}>{deal.business}</span>
        <span className={styles.badges}>
          {deal.pennSpecific && (
            <span className={styles.badgePenn} title="Only for Penn students">
              Penn only
            </span>
          )}
          <span className={styles.badge}>{scopeLabel}</span>
          {kindLabels.map((label) => (
            <span key={label} className={styles.badge}>
              {label}
            </span>
          ))}
          <span className={styles.badge}>{categoryLabel}</span>
          {deal.source === "starter" && !expired && (
            <span className={styles.badgeStarter} title="From our starter list: vote to confirm it still works">
              Starter list
            </span>
          )}
        </span>
      </div>
      {/* The headline is the deal itself ("20% off bowls"), unless the deal has its own title. */}
      <h2 className={styles.cardTitle}>{deal.title ?? deal.summary}</h2>
      {deal.title && <p className={styles.discount}>{deal.summary}</p>}
      {deal.discount && deal.discount !== deal.summary && <p className={styles.detail}>{deal.discount}</p>}

      {deal.code && (
        <div className={styles.codeRow}>
          <code className={styles.code}>{deal.code}</code>
          <button className={styles.smallButton} onClick={() => void copyCode()}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {deal.location && (
        <p className={styles.detail}>
          📍 {neighborhoodLabel && <strong>{neighborhoodLabel} · </strong>}
          {deal.location}
          {deal.mapsUrl && (
            <>
              {" "}
              <a className={styles.link} href={deal.mapsUrl} target="_blank" rel="noopener noreferrer">
                Open in Google Maps ↗
              </a>
            </>
          )}
        </p>
      )}
      {deal.howToClaim && <p className={styles.detail}>{deal.howToClaim}</p>}
      {deal.url && (
        <a className={styles.link} href={deal.url} target="_blank" rel="noopener noreferrer nofollow">
          Get the deal ↗
        </a>
      )}
      {deal.expiresOn && !expired && <p className={styles.meta}>Expires {formatDate(deal.expiresOn)}</p>}
      {(deal.sourcedFrom || deal.addedBy) && (
        <p className={styles.meta}>
          {[deal.sourcedFrom && `Sourced from ${deal.sourcedFrom}`, deal.addedBy && `Added by ${deal.addedBy}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <div className={styles.cardActions}>
        {expired ? (
          <>
            <span className={styles.meta}>
              {deal.expiredReason === "date" && deal.expiresOn
                ? `Ended ${formatDate(deal.expiresOn)}`
                : `Expired ${deal.expiredReason === "votes" ? "by votes" : "by a student"} on ${new Date(deal.statusChangedAt).toLocaleDateString()}`}
            </span>
            {onRestore && (
              <button
                className={styles.smallButton}
                disabled={!signedIn || busy}
                title={signedIn ? "Still works? Bring it back." : SIGN_IN_HINT}
                onClick={() => void busyWhile(onRestore)}
              >
                Restore
              </button>
            )}
          </>
        ) : (
          <>
            <button
              className={deal.myVote === true ? styles.voteActive : styles.vote}
              disabled={!signedIn || busy}
              title={signedIn ? "It works" : SIGN_IN_HINT}
              aria-pressed={deal.myVote === true}
              onClick={() => void voteFor(true)}
            >
              👍 Works · {deal.works}
            </button>
            <button
              className={deal.myVote === false ? styles.voteActiveBad : styles.vote}
              disabled={!signedIn || busy}
              title={signedIn ? "It didn't work for me" : SIGN_IN_HINT}
              aria-pressed={deal.myVote === false}
              onClick={() => void voteFor(false)}
            >
              👎 Doesn&apos;t work · {deal.notWorking}
            </button>
            {onExpire && (
              <button
                className={styles.linkButton}
                disabled={!signedIn || busy}
                title={signedIn ? "This deal has ended" : SIGN_IN_HINT}
                onClick={onExpire}
              >
                Mark expired
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
