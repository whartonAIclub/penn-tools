"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { AuthModal, type CCProfile, PROFILE_KEY } from "./AuthModal";

const displaySerif = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
const navy = "#062A78";

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
