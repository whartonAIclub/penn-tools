import { C, shadow } from "../lib/tokens";
import { formatDate, formatTime } from "../lib/format";
import type { EventItem, ReflectionItem } from "../lib/types";

function SparklesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export type ReflectionModalProps = {
  event: EventItem;
  existingReflection?: ReflectionItem | undefined;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  isSaving: boolean;
};

export function ReflectionModal({
  event, existingReflection, draft, onDraftChange,
  onSave, onDelete, onClose, isSaving,
}: ReflectionModalProps) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(44,26,14,0.45)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      />

      {/* Modal */}
      <div style={{
        position: "relative",
        width: "100%", maxWidth: 520,
        borderRadius: 28,
        border: `1px solid ${C.border}`,
        background: C.surface,
        boxShadow: shadow.xl,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "22px 24px 18px",
          borderBottom: `1px solid ${C.borderMuted}`,
          background: `linear-gradient(135deg, ${C.sageLight} 0%, transparent 60%)`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, color: C.sage }}>
              <SparklesIcon />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                Reflection
              </span>
            </div>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
              {event.title}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: C.textLight }}>
              {formatDate(event.start_time)} at {formatTime(event.start_time)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: "none", background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.textLight, cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = C.surfaceWarm;
              (e.currentTarget as HTMLElement).style.color = C.text;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = C.textLight;
            }}
          >
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>
          <label>
            <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 10 }}>
              What did you learn or take away from this event?
            </span>
            <textarea
              value={draft}
              onChange={e => onDraftChange(e.target.value)}
              placeholder="Share your thoughts, insights, or key takeaways…"
              rows={5}
              style={{
                width: "100%",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.surfaceMuted,
                padding: "12px 14px",
                fontSize: 13,
                lineHeight: 1.65,
                color: C.text,
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                transition: "border-color 0.15s",
              }}
              onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = C.sage; }}
              onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
            />
          </label>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px",
          borderTop: `1px solid ${C.borderMuted}`,
          background: C.surfaceMuted,
          gap: 12,
        }}>
          <div>
            {existingReflection && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isSaving}
                style={{
                  border: "none", background: "none", padding: 0,
                  fontSize: 12, fontWeight: 500, color: C.terra,
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.5 : 1,
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.terraDark; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.terra; }}
              >
                Delete reflection
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px", borderRadius: 10,
                border: "none", background: "none",
                fontSize: 13, fontWeight: 500, color: C.textMuted,
                cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceWarm; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || !draft.trim()}
              style={{
                padding: "8px 20px", borderRadius: 10, border: "none",
                background: C.sage, color: "#fff",
                fontSize: 13, fontWeight: 600,
                cursor: isSaving || !draft.trim() ? "not-allowed" : "pointer",
                opacity: isSaving || !draft.trim() ? 0.5 : 1,
                boxShadow: shadow.sm,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => {
                if (!isSaving && draft.trim()) (e.currentTarget as HTMLElement).style.background = C.sageHover;
              }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.sage; }}
            >
              {isSaving ? "Saving…" : "Save Reflection"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
