"use client";
import { useEffect, useRef, useState } from "react";
import { C, shadow } from "../lib/tokens";
import { formatDate, formatTime, shorten } from "../lib/format";
import type { EventItem } from "../lib/types";

// ── constants ─────────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 90; // px to trigger a decision
const FLY_DISTANCE   = "130%";

// ── helpers ───────────────────────────────────────────────────────────────────
function SvgCal() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function SvgUser() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function SvgX() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function SvgCheck() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── DeckCard (the visual card inside the deck) ────────────────────────────────
function DeckCard({
  event,
  dragX,
  isTop,
  stackIndex,
  onPointerDown,
}: {
  event: EventItem;
  dragX: number;
  isTop: boolean;
  stackIndex: number; // 0 = top, 1 = behind, 2 = further behind
  onPointerDown?: ((e: React.PointerEvent<HTMLDivElement>) => void) | undefined;
}) {
  const rotation   = isTop ? dragX * 0.06 : 0;
  const scale      = isTop ? 1 : stackIndex === 1 ? 0.95 : 0.90;
  const translateY = isTop ? 0 : stackIndex === 1 ? 10 : 20;
  const opacity    = isTop ? 1 : stackIndex === 1 ? 0.8 : 0.55;

  const descriptionPreview = event.description_preview || event.description;
  const location = event.location && !event.location.toLowerCase().includes("sign in") ? event.location : null;
  const isPast = new Date(event.start_time).getTime() < Date.now();

  // Overlay opacity based on drag direction
  const saveOpacity  = isTop && dragX > 20  ? Math.min((dragX - 20) / 80, 1) : 0;
  const skipOpacity  = isTop && dragX < -20 ? Math.min((-dragX - 20) / 80, 1) : 0;

  return (
    <div
      onPointerDown={isTop ? onPointerDown : undefined}
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 20,
        border: `1.5px solid ${C.border}`,
        background: C.surface,
        boxShadow: isTop ? shadow.lg : shadow.sm,
        cursor: isTop ? "grab" : "default",
        userSelect: "none",
        transform: `translateX(${isTop ? dragX : 0}px) translateY(${translateY}px) rotate(${rotation}deg) scale(${scale})`,
        transition: isTop ? "box-shadow 0.15s" : "transform 0.3s ease, opacity 0.3s ease",
        opacity,
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      {/* Top accent */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: isPast ? C.stoneBorder : `linear-gradient(90deg, ${C.sage}, #9FC4A3)`,
      }} />

      {/* Swipe overlays */}
      {saveOpacity > 0 && (
        <div style={{
          position: "absolute", top: 20, left: 20, zIndex: 10,
          padding: "6px 16px", borderRadius: 10,
          border: `2.5px solid ${C.sage}`,
          color: C.sage, fontSize: 20, fontWeight: 800, letterSpacing: "0.08em",
          opacity: saveOpacity, transform: `rotate(-12deg)`,
        }}>SAVE</div>
      )}
      {skipOpacity > 0 && (
        <div style={{
          position: "absolute", top: 20, right: 20, zIndex: 10,
          padding: "6px 16px", borderRadius: 10,
          border: `2.5px solid ${C.terraDark}`,
          color: C.terraDark, fontSize: 20, fontWeight: 800, letterSpacing: "0.08em",
          opacity: skipOpacity, transform: `rotate(12deg)`,
        }}>SKIP</div>
      )}

      {/* Card content */}
      <div style={{ padding: "28px 28px 24px", display: "flex", flexDirection: "column", gap: 14, height: "100%", boxSizing: "border-box" }}>
        {/* Date + time row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 8,
            background: C.sageLight, border: `1px solid ${C.sageBorder}`,
            fontSize: 11, fontWeight: 600, color: C.sageDark,
          }}><SvgCal />{formatDate(event.start_time)}</span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 8,
            background: C.surfaceWarm, fontSize: 11, fontWeight: 500, color: C.textMuted,
          }}>{formatTime(event.start_time)}{event.end_time ? ` – ${formatTime(event.end_time)}` : ""}</span>
          {isPast && (
            <span style={{ padding: "4px 8px", borderRadius: 8, background: "#F0EDE8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#A09080" }}>Past</span>
          )}
        </div>

        {/* Title */}
        <h3 style={{
          margin: 0, fontSize: 21, fontWeight: 700, lineHeight: 1.3, color: C.text,
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {event.title}
        </h3>

        {/* Description */}
        {descriptionPreview && (
          <p style={{
            margin: 0, fontSize: 13.5, lineHeight: 1.65, color: C.textMuted,
            display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {descriptionPreview}
          </p>
        )}

        {/* Pills row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "auto" }}>
          {event.cost_summary && (
            <span style={{ padding: "3px 10px", borderRadius: 8, background: C.terraLight, border: `1px solid ${C.terraBorder}`, fontSize: 11, fontWeight: 500, color: C.terraDark }}>
              {shorten(event.cost_summary, 48)}
            </span>
          )}
          {event.dress_code && (
            <span style={{ padding: "3px 10px", borderRadius: 8, background: C.sageLight, border: `1px solid ${C.sageBorder}`, fontSize: 11, fontWeight: 500, color: C.sageDark }}>
              {event.dress_code}
            </span>
          )}
          {event.date_summary && (
            <span style={{ padding: "3px 10px", borderRadius: 8, background: C.surfaceWarm, fontSize: 11, fontWeight: 500, color: C.textMuted }}>
              {event.date_summary}
            </span>
          )}
        </div>

        {/* Meta footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: `1px solid ${C.borderMuted}`, paddingTop: 12, fontSize: 12, color: C.textLight }}>
          {event.organizer && <span style={{ display: "flex", alignItems: "center", gap: 5 }}><SvgUser />{event.organizer}</span>}
          {location && <span>{location}</span>}
          {event.registration_url && (
            <span style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 100, background: C.terra, color: "#fff", fontSize: 11, fontWeight: 600 }}>
              Registration open
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DiscoverDeck ──────────────────────────────────────────────────────────────
export type DiscoverDeckProps = {
  events: EventItem[];         // pre-filtered list (up to 10)
  savedEventIds: Set<string>;
  savingEventId: string | null;
  onSave: (eventId: string) => void;
  onDismiss: (eventId: string) => void;
  totalFiltered: number;       // total matching events (before deck slice)
};

export function DiscoverDeck({ events, savedEventIds, savingEventId, onSave, onDismiss, totalFiltered }: DiscoverDeckProps) {
  const [deck, setDeck] = useState<EventItem[]>(events);
  const [dragX, setDragX] = useState(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);

  // Sync deck when parent events list changes (filter change)
  useEffect(() => { setDeck(events); setDragX(0); setExitDir(null); }, [events]);

  const current = deck[0];
  const deckVisible = deck.slice(0, 3); // show up to 3 stacked

  const advance = () => {
    setDeck(prev => prev.slice(1));
    setDragX(0);
    setExitDir(null);
    setIsSnapping(false);
  };

  const triggerSave = (eventId: string) => {
    onSave(eventId);
    setExitDir("right");
    setTimeout(advance, 320);
  };

  const triggerDismiss = (eventId: string) => {
    onDismiss(eventId);
    setExitDir("left");
    setTimeout(advance, 320);
  };

  // Pointer drag
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (exitDir) return;
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    setIsSnapping(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    setDragX(e.clientX - startXRef.current);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const dx = e.clientX - startXRef.current;
    if (dx > SWIPE_THRESHOLD && current) triggerSave(current.id);
    else if (dx < -SWIPE_THRESHOLD && current) triggerDismiss(current.id);
    else { setIsSnapping(true); setDragX(0); }
  };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!current || exitDir) return;
      if (e.key === "ArrowRight") triggerSave(current.id);
      if (e.key === "ArrowLeft")  triggerDismiss(current.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, exitDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSaving = current ? savingEventId === current.id : false;

  // ── empty state ─────────────────────────────────────────────────────────────
  if (deck.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 400, textAlign: "center", padding: 32,
        borderRadius: 20, border: `1.5px dashed ${C.borderStrong}`,
        background: C.surfaceMuted,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: C.text }}>
          You&apos;ve seen everything
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: C.textLight, maxWidth: 280, lineHeight: 1.6 }}>
          {totalFiltered === 0
            ? "No events match your current filters. Try adjusting the tags or week."
            : "Adjust your filters or check back for new events."}
        </p>
      </div>
    );
  }

  // ── deck ────────────────────────────────────────────────────────────────────
  const topCardDragX = exitDir === "right" ? 999 : exitDir === "left" ? -999 : dragX;
  const topTransition = exitDir || isSnapping ? `transform 0.32s cubic-bezier(0.25,0.8,0.25,1)` : "none";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: C.textLight }}>
          {deck.length} event{deck.length !== 1 ? "s" : ""} to review
          {totalFiltered > deck.length && <> · {totalFiltered} total match</>}
        </span>
        <span style={{ fontSize: 11, color: C.taupe }}>← Skip &nbsp;·&nbsp; Save →</span>
      </div>

      {/* Card stack */}
      <div
        style={{ position: "relative", height: 440 }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Render back cards first, top card last */}
        {[...deckVisible].reverse().map((event, revIdx) => {
          const stackIndex = deckVisible.length - 1 - revIdx;
          const isTop = stackIndex === 0;
          const cardDragX = isTop ? topCardDragX : 0;
          return (
            <div
              key={event.id}
              style={{
                position: "absolute", inset: 0,
                transform: isTop
                  ? `translateX(${topCardDragX}px) rotate(${topCardDragX * 0.06}deg)`
                  : stackIndex === 1
                    ? `translateY(10px) scale(0.95)`
                    : `translateY(20px) scale(0.90)`,
                opacity: isTop ? 1 : stackIndex === 1 ? 0.8 : 0.55,
                transition: isTop ? topTransition : "transform 0.3s ease, opacity 0.3s ease",
                zIndex: isTop ? 10 : stackIndex === 1 ? 5 : 1,
              }}
            >
              <DeckCard
                event={event}
                dragX={isTop ? topCardDragX : 0}
                isTop={isTop}
                stackIndex={stackIndex}
                onPointerDown={isTop ? handlePointerDown : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginTop: 24 }}>
        <button
          type="button"
          disabled={!current || !!exitDir}
          onClick={() => current && triggerDismiss(current.id)}
          style={{
            width: 60, height: 60, borderRadius: "50%",
            border: `2px solid ${C.stoneBorder}`,
            background: C.surface, color: C.textLight,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: shadow.sm,
            transition: "border-color 0.15s, color 0.15s, box-shadow 0.15s",
            fontSize: 0,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = C.terraDark;
            (e.currentTarget as HTMLElement).style.color = C.terraDark;
            (e.currentTarget as HTMLElement).style.boxShadow = shadow.md;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = C.stoneBorder;
            (e.currentTarget as HTMLElement).style.color = C.textLight;
            (e.currentTarget as HTMLElement).style.boxShadow = shadow.sm;
          }}
          aria-label="Skip event"
        >
          <SvgX />
        </button>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            {deck.indexOf(current!) + 1} / {deck.length}
          </div>
          <div style={{ fontSize: 10, color: C.taupe, marginTop: 2 }}>← / → keys work too</div>
        </div>

        <button
          type="button"
          disabled={!current || !!exitDir || isSaving}
          onClick={() => current && triggerSave(current.id)}
          style={{
            width: 60, height: 60, borderRadius: "50%",
            border: `2px solid ${C.sage}`,
            background: isSaving ? C.sageLight : C.surface,
            color: C.sage,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: shadow.sm,
            transition: "background 0.15s, box-shadow 0.15s",
            fontSize: 0,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = C.sage;
            (e.currentTarget as HTMLElement).style.color = "#fff";
            (e.currentTarget as HTMLElement).style.boxShadow = shadow.md;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = isSaving ? C.sageLight : C.surface;
            (e.currentTarget as HTMLElement).style.color = C.sage;
            (e.currentTarget as HTMLElement).style.boxShadow = shadow.sm;
          }}
          aria-label="Save event"
        >
          <SvgCheck />
        </button>
      </div>
    </div>
  );
}
