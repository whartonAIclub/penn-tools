import { C } from "../lib/tokens";

export function DashboardHero() {
  return (
    <header style={{
      position: "relative",
      overflow: "hidden",
      borderRadius: 28,
      border: `1px solid ${C.border}`,
      background: "linear-gradient(135deg, #ffffff 0%, #fdfcfa 50%, #eee9e0 100%)",
      padding: "40px 48px",
      marginBottom: 32,
      boxShadow: "0 1px 4px rgba(44,26,14,0.06)",
    }}>
      {/* Decorative blobs */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -60, right: -60,
          width: 280, height: 280, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(122,158,126,0.18) 0%, transparent 70%)",
          filter: "blur(32px)",
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: -80,
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(196,112,79,0.13) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
      </div>

      {/* Content */}
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <span style={{ display: "block", width: 28, height: 1.5, background: C.sage, opacity: 0.5 }} />
          <span style={{
            fontSize: 11, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.2em", color: "#9CAD8E",
          }}>
            Wharton MBA · Event Dashboard
          </span>
        </div>

        <h1 style={{
          margin: 0,
          fontSize: "clamp(28px, 4vw, 48px)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          color: C.text,
        }}>
          What&apos;s happening{" "}
          <span style={{ color: C.sage }}>at Penn</span>
        </h1>

        <p style={{
          marginTop: 16,
          maxWidth: 520,
          fontSize: 15,
          lineHeight: 1.7,
          color: C.textMuted,
        }}>
          Discover Penn and Wharton events aligned with your goals. Save what
          matters, then capture reflections — all in one calm workspace.
        </p>
      </div>
    </header>
  );
}
