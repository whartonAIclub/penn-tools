"use client";

import { useState, useEffect } from "react";
import { actionUpsertUser, actionFindUser } from "./actions";

const displaySerif = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
const navy = "#062A78";
export const PROFILE_KEY = "cc_profile";

export interface CCProfile {
  id: string;
  name: string;
  email: string;
}

export function loadProfile(): CCProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as CCProfile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: CCProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // localStorage unavailable (e.g. Safari private mode) — profile won't persist, but session continues
  }
}

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

// ── Auth modal ─────────────────────────────────────────────────────────────
// mode "full"         → guest option visible
// mode "profile-only" → profile only, no guest
export function AuthModal({
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
    if (!email.trim() || !/^[^\s@]+@(?:[a-z0-9-]+\.)*upenn\.edu$/i.test(email.trim())) {
      setError("Please enter a valid Penn email ending in upenn.edu.");
      return;
    }
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

        {/* Error banner */}
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
