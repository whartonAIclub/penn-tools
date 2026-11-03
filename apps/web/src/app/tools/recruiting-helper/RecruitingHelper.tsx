"use client";

// Recruiting Helper's page: the student's profile, a box to paste a job posting
// or LinkedIn profile (text or screenshots), and the ranked list of everything
// scored so far. The profile and list are saved to the user's account by
// actions.ts and score/route.ts, so they're the same on every device.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { CompanyTier, RecruitingProfile, SavedItem, Screenshot } from "@penntools/tool-recruiting-helper";
import { removeMyItem, saveMyProfile } from "./actions";
import { ACCEPT, readScreenshot, screenshotSrc } from "./screenshots";
import styles from "./RecruitingHelper.module.css";

interface ScoreError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

type ScoreResponse = { ok: true; item: SavedItem; replaced: boolean } | { ok: false; error: ScoreError };

type Status = { state: "idle" } | { state: "loading" } | { state: "error"; error: ScoreError };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);
const TIERS: CompanyTier[] = ["target", "secondary", "practice"];
const TIER_HELP: Record<CompanyTier, string> = {
  target: "Target companies: your top choices (+1 on jobs, +2 on people)",
  secondary: "Secondary: would be happy there (+0 on jobs, +1 on people)",
  practice: "Practice: interview practice or backups (-1 on jobs)",
};

/**
 * A profile an earlier version of this page saved in this browser, before
 * profiles were saved to accounts; offered once in the editor, then forgotten.
 */
const oldStorageKey = (userId: string) => `recruiting-helper:${userId}`;

function oldBrowserProfile(userId: string): RecruitingProfile | null {
  try {
    const raw = localStorage.getItem(oldStorageKey(userId));
    const profile = raw ? (JSON.parse(raw) as { profile?: RecruitingProfile }).profile : null;
    return profile && typeof profile.background === "string" ? profile : null;
  } catch {
    return null;
  }
}

/** Ranked as the server ranks them: best score first, most recent first within a score. */
const byRank = (a: SavedItem, b: SavedItem) => b.score - a.score || b.addedAt.localeCompare(a.addedAt);

export function RecruitingHelper({
  userId,
  initialProfile,
  initialItems,
  providers,
  labels,
  samples,
  limits,
}: {
  userId: string;
  initialProfile: RecruitingProfile | null;
  initialItems: SavedItem[];
  /** Providers the user has saved keys for; never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  samples: { profile: RecruitingProfile; posting: string; linkedIn: string };
  limits: { pasteLength: number; screenshots: number };
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [items, setItems] = useState(initialItems);
  const [editingProfile, setEditingProfile] = useState(!initialProfile);
  const [provider, setProvider] = useState(providers[0]!);
  const [browserProfile, setBrowserProfile] = useState<RecruitingProfile | null>(null);

  // localStorage only exists in the browser, so look for an old profile after the first render.
  useEffect(() => {
    if (!initialProfile) setBrowserProfile(oldBrowserProfile(userId));
  }, [userId, initialProfile]);

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Recruiting Helper</h1>
        <p className={styles.intro}>
          Paste a job posting or a LinkedIn profile. It&apos;s scored 1 to 5 against your own target companies, roles
          and background, and added to your ranked list, so you know whom to reach out to first.
        </p>
      </header>

      {editingProfile || !profile ? (
        <ProfileEditor
          key={browserProfile ? "from-browser" : "fresh"}
          initial={profile ?? browserProfile}
          fromBrowser={!profile && !!browserProfile}
          sample={samples.profile}
          onSaved={(saved) => {
            setProfile(saved);
            setEditingProfile(false);
            setBrowserProfile(null);
            try {
              localStorage.removeItem(oldStorageKey(userId)); // now in the account
            } catch {
              // Storage blocked: nothing to forget.
            }
          }}
          onCancel={profile ? () => setEditingProfile(false) : null}
        />
      ) : (
        <ProfileSummary profile={profile} onEdit={() => setEditingProfile(true)} />
      )}

      {profile && (
        <>
          <AddCard
            provider={provider}
            providers={providers}
            labels={labels}
            onProvider={setProvider}
            samples={samples}
            limits={limits}
            onScored={(item) =>
              // A repeat of the same person or posting link comes back with the old entry's id.
              setItems((old) => [item, ...old.filter((i) => i.id !== item.id)].sort(byRank))
            }
          />
          <RankedList items={items} onRemoved={(id) => setItems((old) => old.filter((i) => i.id !== id))} />
        </>
      )}
    </div>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────

const toLines = (s: string) =>
  s
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function ProfileEditor({
  initial,
  fromBrowser,
  sample,
  onSaved,
  onCancel,
}: {
  initial: RecruitingProfile | null;
  /** True when `initial` is an old profile from this browser, not yet in the account. */
  fromBrowser: boolean;
  sample: RecruitingProfile;
  onSaved: (profile: RecruitingProfile) => void;
  onCancel: (() => void) | null;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function save() {
    const profile: RecruitingProfile = {
      background: form.background.trim(),
      targetRoles: form.targetRoles.trim(),
      companies,
      bonusSignals: toLines(form.signals).slice(0, 10),
    };
    setSaving(true);
    setError(null);
    try {
      const result = await saveMyProfile(profile);
      if (result.ok) onSaved(profile);
      else setError(result.message);
    } catch {
      setError("Couldn't save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Your profile</h2>
        <button className={styles.textButton} onClick={() => setForm(fill(sample))}>
          Fill with an example
        </button>
      </div>
      <p className={styles.help}>
        Saved to your account, so it&apos;s the same on every device you sign in on. Scores use only what you write
        here, so include what you&apos;d want an interviewer to know.
      </p>
      {fromBrowser && (
        <p className={styles.notice}>
          We found a profile you saved in this browser earlier. Check it, then save it to your account.
        </p>
      )}

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
        <button className={styles.button} disabled={!ready || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {onCancel && (
          <button className={styles.textButton} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
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
  provider,
  providers,
  labels,
  onProvider,
  samples,
  limits,
  onScored,
}: {
  provider: AIProvider;
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  onProvider: (p: AIProvider) => void;
  samples: { posting: string; linkedIn: string };
  limits: { pasteLength: number; screenshots: number };
  onScored: (item: SavedItem) => void;
}) {
  const [kind, setKind] = useState<Kind>("posting");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [latest, setLatest] = useState<{ item: SavedItem; replaced: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Reads image files into screenshots, up to the limit; shows the first problem. */
  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const room = limits.screenshots - screenshots.length;
    if (room <= 0) {
      setStatus({ state: "error", error: { message: `You can add at most ${limits.screenshots} screenshots.` } });
      return;
    }
    setReading(true);
    try {
      const read = await Promise.all(images.slice(0, room).map(readScreenshot));
      setScreenshots((old) => [...old, ...read].slice(0, limits.screenshots));
      setStatus(
        images.length > room
          ? { state: "error", error: { message: `Only the first ${room} were added: at most ${limits.screenshots} screenshots.` } }
          : { state: "idle" },
      );
    } catch (error) {
      setStatus({ state: "error", error: { message: error instanceof Error ? error.message : "Couldn't read that image." } });
    } finally {
      setReading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.some((f) => f.type.startsWith("image/"))) {
      e.preventDefault(); // keep the image out of the text box
      void addFiles(files);
    }
  }

  async function score() {
    setStatus({ state: "loading" });
    try {
      const res = await fetch("/tools/recruiting-helper/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, provider, text, screenshots, ...(kind === "posting" && { link }) }),
      });
      if (res.status === 401) {
        setStatus({ state: "error", error: { message: "Sign in with the button at the top right first." } });
        return;
      }
      let result: ScoreResponse;
      try {
        result = (await res.json()) as ScoreResponse;
      } catch {
        setStatus({ state: "error", error: { message: `Scoring failed (HTTP ${res.status}). Try again.` } });
        return;
      }
      if (!result.ok) {
        setStatus({ state: "error", error: result.error });
        return;
      }
      onScored(result.item);
      setLatest({ item: result.item, replaced: result.replaced });
      setText("");
      setLink("");
      setScreenshots([]);
      setStatus({ state: "idle" });
    } catch {
      setStatus({ state: "error", error: { message: "Couldn't reach PennTools. Check your connection and try again." } });
    }
  }

  const busy = status.state === "loading" || reading;

  return (
    <section className={styles.card} onPaste={onPaste}>
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
          ? "Paste the posting's text, or screenshots of it (⌘V / Ctrl+V)."
          : "Paste screenshots of their LinkedIn profile (⌘V / Ctrl+V), or select all the text on it, copy and paste."}{" "}
        <button className={styles.textButton} onClick={() => setText(kind === "posting" ? samples.posting : samples.linkedIn)}>
          Try an example
        </button>
      </p>
      <div
        className={dragging ? `${styles.dropZone} ${styles.dropping}` : styles.dropZone}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length === 0) return;
          e.preventDefault();
          setDragging(false);
          void addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <textarea
          aria-label={kind === "posting" ? "Job posting" : "LinkedIn profile text"}
          className={styles.textarea}
          rows={screenshots.length ? 4 : 8}
          value={text}
          maxLength={limits.pasteLength}
          placeholder={kind === "posting" ? "Paste the posting here" : "Paste screenshots or profile text here"}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.shots}>
          {screenshots.map((shot, i) => (
            <figure key={i} className={styles.shot}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, nothing for next/image to optimize */}
              <img src={screenshotSrc(shot)} alt={`Screenshot ${i + 1}`} />
              <button
                className={styles.shotRemove}
                aria-label={`Remove screenshot ${i + 1}`}
                onClick={() => setScreenshots((old) => old.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </figure>
          ))}
          {screenshots.length < limits.screenshots && (
            <button className={styles.addShot} onClick={() => fileInput.current?.click()} disabled={reading}>
              {reading ? "Reading…" : "+ Add screenshots"}
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = ""; // so picking the same file again still fires
            }}
          />
        </div>
      </div>
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
        <button className={styles.button} onClick={() => void score()} disabled={busy || (!text.trim() && screenshots.length === 0)}>
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

function RankedList({ items, onRemoved }: { items: SavedItem[]; onRemoved: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const ranked = useMemo(() => items.filter((i) => filter === "all" || i.kind === filter).sort(byRank), [items, filter]);

  async function remove(id: string) {
    setRemoveError(null);
    try {
      const result = await removeMyItem(id);
      // Already gone (say, removed on another device) is fine: take it off this list too.
      if (result.ok || result.message === "That item was already removed.") onRemoved(id);
      else setRemoveError(result.message);
    } catch {
      setRemoveError("Couldn't remove it. Check your connection and try again.");
    }
  }

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
                  <button className={styles.textButton} onClick={() => void remove(item.id)}>
                    Remove from list
                  </button>
                  {removeError && <p className={styles.error}>{removeError}</p>}
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
