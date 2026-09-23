import Link from "next/link";
import { C, shadow } from "../lib/tokens";

type CompassHeaderProps = {
  isSyncing: boolean;
  onSync: () => void;
};

const SPIN_CSS = `@keyframes compass-spin { to { transform: rotate(360deg); } }`;

export function CompassHeader({ isSyncing, onSync }: CompassHeaderProps) {
  return (
    <>
      <style>{SPIN_CSS}</style>
      <nav style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(250,248,244,0.96)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}>
        <div style={{
          maxWidth: 1152,
          margin: "0 auto",
          padding: "0 24px",
          height: 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: C.sage,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: shadow.sm,
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>🧭</span>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
                Compass
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.sage, letterSpacing: "0.04em" }}>
                Wharton MBA
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              href="/tools/19/reflections"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                borderRadius: 100,
                border: `1px solid ${C.border}`,
                background: C.surface,
                fontSize: 13,
                fontWeight: 500,
                color: C.textMuted,
                textDecoration: "none",
                boxShadow: shadow.sm,
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder;
                (e.currentTarget as HTMLElement).style.color = C.sageDark;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = C.border;
                (e.currentTarget as HTMLElement).style.color = C.textMuted;
              }}
            >
              Reflections
            </Link>

            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                borderRadius: 100,
                border: "none",
                background: C.sage,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: isSyncing ? "not-allowed" : "pointer",
                opacity: isSyncing ? 0.6 : 1,
                boxShadow: `${shadow.sm}, 0 0 0 3px ${C.sageLight}`,
                transition: "background 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => {
                if (!isSyncing) (e.currentTarget as HTMLElement).style.background = C.sageHover;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = C.sage;
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1, animation: isSyncing ? "compass-spin 1s linear infinite" : "none" }}>
                🔄
              </span>
              {isSyncing ? "Syncing…" : "Sync Events"}
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
