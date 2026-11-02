"use client";

// Recruiting Helper's page: the student's profile, a box to paste a job posting
// or LinkedIn profile, and the ranked list of everything scored so far. The
// profile and list live in this browser's localStorage, keyed by user, so
// nobody's contacts are stored on the server.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type {
  CompanyTier,
  RecruitingProfile,
  ScoredContact,
  ScoredPosting,
} from "@penntools/tool-recruiting-helper";
import { scoreContact, scorePosting, type ActionError, type ActionResult } from "./actions";
import styles from "./RecruitingHelper.module.css";

type SavedPosting = ScoredPosting & { id: string; addedAt: string; link: string | null };
type SavedContact = ScoredContact & { id: string; addedAt: string };
type SavedItem = SavedPosting | SavedContact;

interface Stored {
  profile: RecruitingProfile | null;
  items: SavedItem[];
}

type Status = { state: "idle" } | { state: "loading" } | { state: "error"; error: ActionError };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);
const TIERS: CompanyTier[] = ["target", "secondary", "practice"];
const TIER_HELP: Record<CompanyTier, string> = {
  target: "Target companies: your top choices (+1 on jobs, +2 on people)",
  secondary: "Secondary: would be happy there (+0 on jobs, +1 on people)",
  practice: "Practice: interview practice or backups (-1 on jobs)",
};

const storageKey = (userId: string) => `recruiting-helper:${userId}`;

function load(userId: string): Stored {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // Unreadable data: start fresh rather than break the page.
  }
  return { profile: null, items: [] };
}

const normalName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function RecruitingHelper({
  userId,
  providers,
  labels,
  samples,
  maxPasteLength,
}: {
  userId: string;
  /** Providers the user has saved keys for; never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  samples: { profile: RecruitingProfile; posting: string; linkedIn: string };
  maxPasteLength: number;
}) {
  const [stored, setStored] = useState<Stored | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [provider, setProvider] = useState(providers[0]!);

  // localStorage only exists in the browser, so read it after the first render.
  useEffect(() => {
    const data = load(userId);
    setStored(data);
    setEditingProfile(!data.profile);
  }, [userId]);

  function save(next: Stored) {
    setStored(next);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      // Storage full or blocked: the list still works until the page is closed.
    }
  }

  if (!stored) return null;

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Recruiting Helper</h1>
        <p className={styles.intro}>
          Paste a job posting or a LinkedIn profile. It&apos;s scored 1 to 5 against your own target companies, roles
          and background, and added to your ranked list, so you know whom to reach out to first.
        </p>
      </header>

      {editingProfile || !stored.profile ? (
        <ProfileEditor
          initial={stored.profile}
          sample={samples.profile}
          onSave={(profile) => {
            save({ ...stored, profile });
            setEditingProfile(false);
          }}
          onCancel={stored.profile ? () => setEditingProfile(false) : null}
        />
      ) : (
        <ProfileSummary profile={stored.profile} onEdit={() => setEditingProfile(true)} />
      )}

      {stored.profile && (
        <>
          <AddCard
            profile={stored.profile}
            provider={provider}
            providers={providers}
            labels={labels}
            onProvider={setProvider}
            samples={samples}
            maxLength={maxPasteLength}
            items={stored.items}
            onScored={(item) => {
              // A repeat of the same person or posting link replaces the old entry.
              const items = stored.items.filter((old) => !isSame(old, item));
              save({ ...stored, items: [item, ...items] });
            }}
          />
          <RankedList items={stored.items} onRemove={(id) => save({ ...stored, items: stored.items.filter((i) => i.id !== id) })} />
        </>
      )}
    </div>
  );
}

function isSame(a: SavedItem, b: SavedItem): boolean {
  if (a.kind === "contact" && b.kind === "contact") return !!a.name && !!b.name && normalName(a.name) === normalName(b.name);
  if (a.kind === "posting" && b.kind === "posting") return !!a.link && a.link === b.link;
  return false;
}

// ── Profile ──────────────────────────────────────────────────────────────────

const toLines = (s: string) =>
  s
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function ProfileEditor({
  initial,
  sample,
  onSave,
  onCancel,
}: {
  initial: RecruitingProfile | null;
  sample: RecruitingProfile;
  onSave: (profile: RecruitingProfile) => void;
  onCancel: (() => void) | null;
}) {
  const companiesIn = (p: RecruitingProfile | null, tier: CompanyTier) =>
    (p?.companies ?? [])
      .filter((c) => c.tier === tier)
      .map((c) => c.name)
      .join("\n");
  const fill = (p: RecruitingProfile | null) => ({
    background: p?.background ?? "",
    targetRoles: p?.targetRoles ?? "",
    target: companiesIn(p, "target"),
    secondary: companiesIn(p, "secondary"),
    practice: companiesIn(p, "practice"),
    signals: (p?.bonusSignals ?? []).join("\n"),
  });
  const [form, setForm] = useState(() => fill(initial));
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const companies = TIERS.flatMap((tier) => toLines(form[tier]).map((name) => ({ name, tier })));
  const ready = form.background.trim() && form.targetRoles.trim() && companies.length > 0;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Your profile</h2>
        <button className={styles.textButton} onClick={() => setForm(fill(sample))}>
          Fill with an example
        </button>
      </div>
      <p className={styles.help}>
        Saved only in this browser. Scores use only what you write here, so include what you&apos;d want an
        interviewer to know.
      </p>

      <label className={styles.label}>
        Your background
        <span className={styles.hint}>Paste your résumé or a summary: roles, results, skills, schools, languages.</span>
        <textarea className={styles.textarea} rows={7} value={form.background} onChange={set("background")} />
      </label>

      <label className={styles.label}>
        Roles you&apos;re targeting
        <input
          className={styles.input}
          value={form.targetRoles}
          placeholder="e.g. strategic partnerships, business development"
          onChange={set("targetRoles")}
        />
      </label>

      <div className={styles.tiers}>
        {TIERS.map((tier) => (
          <label key={tier} className={styles.label}>
            {tier[0]!.toUpperCase() + tier.slice(1)}
            <span className={styles.hint}>{TIER_HELP[tier].split(": ")[1]}</span>
            <textarea
              className={styles.textarea}
              rows={5}
              value={form[tier]}
              placeholder="One company per line"
              onChange={set(tier)}
            />
          </label>
        ))}
      </div>
      <p className={styles.hint}>
        Companies not on any list count -1 on jobs. Write alternatives on one line, like &quot;Amazon / AWS&quot;.
      </p>

      <label className={styles.label}>
        Bonus signals (optional)
        <span className={styles.hint}>
          Things you share with people worth meeting, one per line, e.g. &quot;Wharton&quot;, &quot;Speaks
          Mandarin&quot;. Each one visible on a profile adds a point.
        </span>
        <textarea className={styles.textarea} rows={3} value={form.signals} onChange={set("signals")} />
      </label>

      <div className={styles.actions}>
        <button
          className={styles.button}
          disabled={!ready}
          onClick={() =>
            onSave({
              background: form.background.trim(),
              targetRoles: form.targetRoles.trim(),
              companies,
              bonusSignals: toLines(form.signals).slice(0, 10),
            })
          }
        >
          Save profile
        </button>
        {onCancel && (
          <button className={styles.textButton} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

function ProfileSummary({ profile, onEdit }: { profile: RecruitingProfile; onEdit: () => void }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Your profile</h2>
        <button className={styles.textButton} onClick={onEdit}>
          Edit
        </button>
      </div>
      <p className={styles.summary}>
        <strong>Roles:</strong> {profile.targetRoles}
      </p>
      {TIERS.map((tier) => {
        const names = profile.companies.filter((c) => c.tier === tier).map((c) => c.name);
        return names.length ? (
          <p key={tier} className={styles.summary}>
            <strong>{tier[0]!.toUpperCase() + tier.slice(1)}:</strong> {names.join(", ")}
          </p>
        ) : null;
      })}
      {profile.bonusSignals.length > 0 && (
        <p className={styles.summary}>
          <strong>Bonus signals:</strong> {profile.bonusSignals.join(", ")}
        </p>
      )}
    </section>
  );
}

// ── Paste and score ──────────────────────────────────────────────────────────

type Kind = "posting" | "contact";

function AddCard({
  profile,
  provider,
  providers,
  labels,
  onProvider,
  samples,
  maxLength,
  items,
  onScored,
}: {
  profile: RecruitingProfile;
  provider: AIProvider;
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  onProvider: (p: AIProvider) => void;
  samples: { posting: string; linkedIn: string };
  maxLength: number;
  items: SavedItem[];
  onScored: (item: SavedItem) => void;
}) {
  const [kind, setKind] = useState<Kind>("posting");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [latest, setLatest] = useState<{ item: SavedItem; replaced: boolean } | null>(null);

  async function score() {
    setStatus({ state: "loading" });
    try {
      const result: ActionResult<ScoredPosting | ScoredContact> =
        kind === "posting" ? await scorePosting(provider, profile, text) : await scoreContact(provider, profile, text);
      if (!result.ok) return setStatus({ state: "error", error: result.error });
      const base = { id: crypto.randomUUID(), addedAt: new Date().toISOString() };
      const item: SavedItem =
        result.data.kind === "posting"
          ? { ...result.data, ...base, link: link.trim() || null }
          : { ...result.data, ...base };
      if (item.kind === "contact" && !item.name) {
        setStatus({
          state: "error",
          error: { message: "I couldn't find the person's name in that text. Copy the whole profile, including the name at the top." },
        });
        return;
      }
      const replaced = items.some((old) => isSame(old, item));
      onScored(item);
      setLatest({ item, replaced });
      setText("");
      setLink("");
      setStatus({ state: "idle" });
    } catch {
      setStatus({ state: "error", error: { message: "Something went wrong. Try again." } });
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Score something</h2>
        <div className={styles.toggle} role="tablist">
          {(["posting", "contact"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? styles.toggleOn : styles.toggleOff}
              onClick={() => setKind(k)}
            >
              {k === "posting" ? "Job posting" : "LinkedIn profile"}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.help}>
        {kind === "posting"
          ? "Copy the whole posting from the company's careers page and paste it here."
          : "On their LinkedIn profile, select all the text (⌘A / Ctrl+A), copy, and paste it here."}{" "}
        <button className={styles.textButton} onClick={() => setText(kind === "posting" ? samples.posting : samples.linkedIn)}>
          Try an example
        </button>
      </p>
      <textarea
        aria-label={kind === "posting" ? "Job posting" : "LinkedIn profile text"}
        className={styles.textarea}
        rows={8}
        value={text}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
      />
      {kind === "posting" && (
        <input
          aria-label="Link to the posting"
          className={styles.input}
          value={link}
          placeholder="Link to the posting (optional)"
          onChange={(e) => setLink(e.target.value)}
        />
      )}
      <div className={styles.actions}>
        <button className={styles.button} onClick={() => void score()} disabled={status.state === "loading" || !text.trim()}>
          {status.state === "loading" ? "Scoring…" : "Score it"}
        </button>
        {providers.length > 1 ? (
          <label className={styles.provider}>
            using
            <select value={provider} onChange={(e) => onProvider(e.target.value as AIProvider)}>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {labels[p]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className={styles.hint}>using {labels[provider]}</span>
        )}
      </div>

      {status.state === "error" && (
        <p className={styles.error}>
          {status.error.message}
          {status.error.kind && KEY_PROBLEMS.has(status.error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}
      {latest && (
        <div className={styles.latest}>
          <p className={styles.hint}>
            {latest.replaced ? "Already on your list, so it was updated:" : "Added to your list:"}
          </p>
          <ItemDetails item={latest.item} />
        </div>
      )}
    </section>
  );
}

// ── Ranked list ──────────────────────────────────────────────────────────────

type Filter = "all" | Kind;

function RankedList({ items, onRemove }: { items: SavedItem[]; onRemove: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const ranked = useMemo(
    () =>
      items
        .filter((i) => filter === "all" || i.kind === filter)
        .sort((a, b) => b.score - a.score || b.addedAt.localeCompare(a.addedAt)),
    [items, filter],
  );

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Your ranked list</h2>
        <div className={styles.toggle}>
          {(
            [
              ["all", "All"],
              ["posting", "Jobs"],
              ["contact", "People"],
            ] as const
          ).map(([f, label]) => (
            <button key={f} className={filter === f ? styles.toggleOn : styles.toggleOff} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {ranked.length === 0 ? (
        <p className={styles.help}>Nothing here yet. Score a job posting or a LinkedIn profile above.</p>
      ) : (
        <ol className={styles.list}>
          {ranked.map((item) => (
            <li key={item.id} className={styles.listItem}>
              <button className={styles.listRow} onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}>
                <ScoreBadge score={item.score} />
                <span className={styles.listText}>
                  <strong>{item.kind === "posting" ? item.title : item.name}</strong>
                  <span className={styles.hint}>
                    {item.kind === "posting" ? item.company : `${item.title} at ${item.company}`} ·{" "}
                    {item.kind === "posting" ? "Job" : `${item.priority} priority`}
                    {item.kind === "posting" && item.applyBy ? ` · apply by ${item.applyBy}` : ""}
                  </span>
                </span>
              </button>
              {open === item.id && (
                <div className={styles.listDetails}>
                  <ItemDetails item={item} />
                  <button className={styles.textButton} onClick={() => onRemove(item.id)}>
                    Remove from list
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 4 ? styles.high : score === 3 ? styles.medium : styles.low;
  return (
    <span className={`${styles.badge} ${tone}`} aria-label={`Score ${score} of 5`}>
      {score}
    </span>
  );
}

const tierLabel = (tier: CompanyTier | "off-list") =>
  tier === "off-list" ? "not on your list" : `${tier[0]!.toUpperCase() + tier.slice(1)} company`;

function ItemDetails({ item }: { item: SavedItem }) {
  if (item.kind === "posting") {
    return (
      <div className={styles.details}>
        <p>
          <ScoreBadge score={item.score} /> <strong>{item.title}</strong> at {item.company} ({tierLabel(item.tier)})
        </p>
        <p>
          <strong>Why:</strong> Role fit {item.roleFit}/5, {item.adjustment}. {item.reason}
        </p>
        {item.leadWith.length > 0 && (
          <p>
            <strong>Lead with:</strong> {item.leadWith.join("; ")}
          </p>
        )}
        <p>
          <strong>Gaps:</strong> {item.gaps.length ? item.gaps.join("; ") : "None found"}
        </p>
        <p>
          <strong>Apply by:</strong> {item.applyBy ?? "not stated"}
          {item.link && (
            <>
              {" · "}
              <a href={item.link} target="_blank" rel="noreferrer" className={styles.link}>
                Open posting
              </a>
            </>
          )}
        </p>
        {item.tier === "off-list" && (
          <p className={styles.hint}>{item.company} isn&apos;t on your company lists. Add it to your profile if you want it to count.</p>
        )}
      </div>
    );
  }
  return (
    <div className={styles.details}>
      <p>
        <ScoreBadge score={item.score} /> <strong>{item.name}</strong>, {item.title} at {item.company} ({item.priority}{" "}
        priority)
      </p>
      <p>
        <strong>Why:</strong> Starts at 1
        {item.points.length ? `, ${item.points.join(", ")}` : "; no matching signals"}
        {item.capped && " (capped at 5)"}
      </p>
      {item.matchedSignals.length > 0 && (
        <p className={styles.hint}>
          Seen on profile: {item.matchedSignals.map((m) => `${m.signal} (“${m.evidence}”)`).join("; ")}
        </p>
      )}
      <p>
        <strong>Hook:</strong> {item.hook}
      </p>
    </div>
  );
}
