"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { actionUpsertUser, actionFindUser } from "./actions";

const displaySerif = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
const navy = "#062A78";

const PROFILE_KEY = "cc_profile";

interface CCProfile {
  id: string;
  name: string;
  email: string;
}

function loadProfile(): CCProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as CCProfile) : null;
  } catch {
    return null;
  }
}

function saveProfile(p: CCProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // localStorage unavailable (e.g. Safari private mode) — profile won't persist, but session continues
  }
}

// ── Auth modal ─────────────────────────────────────────────────────────────
// mode "full"         → shown by "Find my path." — guest option visible
// mode "profile-only" → shown by "My Profile"   — profile only, no guest
function AuthModal({
  mode,
  onClose,
  onGuest,
  onProfile,
}: {
  mode: "full" | "profile-only";
  onClose: () => void;
  onGuest: () => void;
  onProfile: (p: CCProfile) => void;
}) {
  const [existingProfile, setExistingProfile] = useState<CCProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = loadProfile();
    if (p) {
      setExistingProfile(p);
    } else {
      setShowForm(true);
    }
  }, []);

  async function handleContinueProfile() {
    setLoading(true);
    setError("");
    try {
      const dbUser = await actionFindUser(existingProfile!.email);
      if (dbUser) {
        const p: CCProfile = { id: dbUser.id, name: dbUser.name, email: dbUser.email };
        saveProfile(p);
        onProfile(p);
      } else {
        const dbUser2 = await actionUpsertUser(existingProfile!.name, existingProfile!.email);
        const p: CCProfile = { id: dbUser2.id, name: dbUser2.name, email: dbUser2.email };
        saveProfile(p);
        onProfile(p);
      }
    } catch {
      setError("Could not load your profile. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!email.trim() || !/^[^\s@]+@(?:[a-z0-9-]+\.)*upenn\.edu$/i.test(email.trim())) { setError("Please enter a valid Penn email ending in upenn.edu."); return; }
    setLoading(true);
    setError("");
    try {
      const dbUser = await actionUpsertUser(name.trim(), email.trim());
      const p: CCProfile = { id: dbUser.id, name: dbUser.name, email: dbUser.email };
      saveProfile(p);
      onProfile(p);
    } catch {
      setError("Could not save profile. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(15,29,58,0.35)",
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => { if (!loading && e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#FDFCF9",
        borderRadius: 20,
        border: "1px solid #E8E2D8",
        boxShadow: "0 24px 64px rgba(15,29,58,0.14)",
        padding: "40px 44px",
        width: "100%",
        maxWidth: 420,
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontFamily: displaySerif, fontSize: 20, color: "#171412" }}>
              <strong>Career </strong>
              <em style={{ fontWeight: 400, color: "#8E6E67" }}>Canvas</em>
            </span>
            <button type="button" onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#9A918A", fontSize: 20, lineHeight: 1, padding: "2px 4px" }}
              aria-label="Close">
              ✕
            </button>
          </div>
          <h2 style={{ margin: "12px 0 6px", fontSize: 22, fontWeight: 700, color: "#171412", fontFamily: displaySerif, letterSpacing: "-0.03em" }}>
            {existingProfile && !showForm ? `Welcome back, ${existingProfile.name.split(" ")[0]}.` : "Create your profile"}
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "#77716B", lineHeight: 1.5 }}>
            {existingProfile && !showForm
              ? "Pick up where you left off, or start fresh."
              : "Save your roadmap and return any semester."}
          </p>
        </div>

        {/* Error banner — shown for both returning-user and create-profile flows */}
        {error && (
          <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Returning user */}
        {existingProfile && !showForm && (
          <div>
            <div style={{
              padding: "14px 18px", borderRadius: 12,
              background: "#F0EDE7", border: "1px solid #DDD8CF",
              marginBottom: 20, fontSize: 14, color: "#3A3530",
            }}>
              <div style={{ fontWeight: 600 }}>{existingProfile.name}</div>
              <div style={{ color: "#77716B", marginTop: 2 }}>{existingProfile.email}</div>
            </div>
            <button type="button" onClick={handleContinueProfile} disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.65 : 1 }}>
              {loading ? "Loading…" : `Continue as ${existingProfile.name.split(" ")[0]} →`}
            </button>
            <button type="button" onClick={() => { setExistingProfile(null); setShowForm(true); }}
              disabled={loading}
              style={{ ...ghostBtn, marginTop: 10, opacity: loading ? 0.5 : 1 }}>
              Use a different profile
            </button>
          </div>
        )}

        {/* Create profile form */}
        {showForm && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Your name</label>
              <input
                style={inputStyle}
                placeholder="e.g. Alex Chen"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Penn email</label>
              <input
                type="email"
                style={inputStyle}
                placeholder="yourname@upenn.edu"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
              />
            </div>
            <button type="button" onClick={handleCreate} disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.65 : 1 }}>
              {loading ? "Saving…" : "Save & continue →"}
            </button>
          </div>
        )}

        {/* Guest option — only in "full" mode */}
        {mode === "full" && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #EAE5DC", textAlign: "center" }}>
            <button type="button" onClick={onGuest}
              style={{ background: "none", border: "none", color: "#9A918A", fontSize: 14, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
              Continue as guest
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared button styles ───────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  width: "100%", padding: "13px 0", borderRadius: 999,
  background: navy, color: "#fff", fontWeight: 600,
  fontSize: 15, border: "none", cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  width: "100%", padding: "11px 0", borderRadius: 999,
  background: "none", color: "#3A3530", fontWeight: 500,
  fontSize: 14, border: "1px solid #DDD8CF", cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600,
  marginBottom: 6, color: "#3A3530",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 10,
  border: "1px solid #DDD8CF", fontSize: 14,
  fontFamily: "inherit", boxSizing: "border-box",
  background: "#fff", color: "#1a1a1a", outline: "none",
};

// ── Watercolor image ───────────────────────────────────────────────────────
function WatercolorCanvas() {
  return (
    <img
      src="/tools/8/watercolor.png"
      alt=""
      aria-hidden="true"
      style={{ width: "100%", height: "auto", display: "block", mixBlendMode: "multiply" }}
    />
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function CareerCanvasPage() {
  const router = useRouter();
  const [modal, setModal] = useState<"full" | "profile-only" | null>(null);

  function goAbout() { router.push("/tools/8/about"); }

  function goWizard(profile?: CCProfile) {
    if (profile) {
      sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } else {
      sessionStorage.removeItem(PROFILE_KEY);
    }
    router.push("/tools/8/wizard");
  }

  return (
    <div className={styles.shell}>

      {modal && (
        <AuthModal
          mode={modal}
          onClose={() => setModal(null)}
          onGuest={() => goWizard()}
          onProfile={(p) => goWizard(p)}
        />
      )}

      <header className={styles.header}>
        <span style={{ fontSize: 26, lineHeight: 1, letterSpacing: "-0.03em", color: "#171412", fontFamily: displaySerif }}>
          <span style={{ fontWeight: 700 }}>Career </span>
          <em style={{ fontStyle: "italic", fontWeight: 400, color: "#8E6E67" }}>Canvas</em>
        </span>
        <nav className={styles.nav} aria-label="Career Canvas">
          {["How it works", "Features", "For Universities"].map((label, index) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button type="button" className={styles.navButton} onClick={goAbout}>{label}</button>
              {index < 2 && <span className={styles.navDot}>·</span>}
            </div>
          ))}
        </nav>
        <button type="button" onClick={() => setModal("profile-only")}
          style={{ borderRadius: 999, background: navy, padding: "14px 30px", color: "#fff", fontSize: 15, fontWeight: 600, boxShadow: "0 8px 18px rgba(6,42,120,0.12)", border: "none", cursor: "pointer" }}>
          My Profile
        </button>
      </header>

      <main className={styles.main}>
        <section className={styles.copy}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "#9E7D75" }}>
            <span style={{ width: 40, height: 1, background: "#C9B8B2", display: "inline-block" }} />
            <span>For every student. Every major. Every dream.</span>
          </div>
          <h1 style={{ maxWidth: 520, margin: 0, color: "#171412", fontFamily: displaySerif, lineHeight: 0.95, letterSpacing: "-0.05em", fontWeight: 700 }} className={styles.headline}>
            Your future is<br />
            a blank{" "}
            <em style={{ fontStyle: "italic", fontWeight: 400, color: "#9A6E67" }}>canvas.</em>
          </h1>
          <p style={{ margin: "28px 0 0", fontSize: 20, lineHeight: 1.45, color: "#3F3B39" }} className={styles.subCopy}>
            Tell us where you want to go — we&apos;ll help you<br />
            figure out how to get there.<br />
            <span style={{ color: "#77716B" }}>Any school. Any year. Any starting point.</span>
          </p>
          <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setModal("full")}
              style={{ borderRadius: 999, background: navy, padding: "16px 32px", color: "#fff", fontWeight: 600, boxShadow: "0 8px 18px rgba(6,42,120,0.12)", border: "none", cursor: "pointer" }}
              className={styles.ctaPrimary}>
              Find my path.
            </button>
            <button type="button" onClick={goAbout}
              style={{ background: "none", border: "none", color: "#4E4A47", fontWeight: 500, cursor: "pointer" }}
              className={styles.ctaSecondary}>
              See how it works →
            </button>
          </div>
        </section>

        <section className={styles.visual}>
          <div className={styles.visualInner}>
            <WatercolorCanvas />
            <div className={`${styles.badge} ${styles.badgeTop}`}>
              <span className={styles.badgeDot} style={{ background: "#91A785" }} />
              <span>3 paths explored.</span>
            </div>
            <div className={`${styles.badge} ${styles.badgeBottom}`}>
              <span className={styles.badgeDot} style={{ background: "#B56F67" }} />
              <span>Your story is taking shape.</span>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footerBar}>
        Empowering Penn students to turn academic choices into career momentum.
      </footer>
    </div>
  );
}
