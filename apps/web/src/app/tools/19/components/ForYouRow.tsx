"use client";

import { useRef, useState } from "react";
import { C, shadow } from "../lib/tokens";
import type { EventItem } from "../lib/types";

export type MatchedTag = { label: string; emoji: string };

type ForYouRowProps = {
  event: EventItem;
  matchedTags: MatchedTag[];
  whyItMatches: string;
  isSaving: boolean;
  onSave: (id: string) => void;
  onPass: (id: string) => void;
  onLater: (id: string) => void;
  onViewDetails: (id: string) => void;
};

const THRESHOLD = 80;

export function ForYouRow({
  event, matchedTags, whyItMatches,
  isSaving, onSave, onPass, onLater, onViewDetails,
}: ForYouRowProps) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);

  const isDraggingRef = useRef(false);
  const dragXRef     = useRef(0);
  const startXRef    = useRef(0);
  const hasDraggedRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    startXRef.current   = e.clientX;
    hasDraggedRef.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    dragXRef.current = dx;
    if (Math.abs(dx) > 6) hasDraggedRef.current = true;
    setDragX(dx);
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    const dx = dragXRef.current;
    if (dx < -THRESHOLD) {
      setExitDir("left");
      setTimeout(() => onPass(event.id), 280);
    } else if (dx > THRESHOLD) {
      setExitDir("right");
      setTimeout(() => onLater(event.id), 280);
    } else {
      dragXRef.current = 0;
      setDragX(0);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) return;
    if ((e.target as HTMLElement).closest("button")) return;
    onViewDetails(event.id);
  };

  const translateX = exitDir === "left" ? -680 : exitDir === "right" ? 680 : dragX;
  const opacity    = exitDir ? 0 : Math.max(0.35, 1 - Math.abs(dragX) / 260);
  const transition = exitDir
    ? "transform 0.28s ease-out, opacity 0.28s"
    : isDragging
    ? "none"
    : "transform 0.22s ease-out";

  const absX         = Math.abs(dragX);
  const isPassSide   = dragX < -20;
  const isLaterSide  = dragX > 20;
  const swipeRatio   = Math.min(1, absX / THRESHOLD);

  // ── Date formatting ────────────────────────────────────────────────────────
  const startDate  = new Date(event.start_time);
  const monthLabel = startDate.toLocaleString("en-US", { month: "short" });
  const dayLabel   = startDate.getDate();
  const timeLabel  = startDate.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const endDate    = event.end_time ? new Date(event.end_time) : null;
  const endLabel   = endDate
    ? endDate.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : null;

  return (
    <div style={{ position: "relative", marginBottom: 10 }}>

      {/* Pass background (left swipe) */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 16,
        display: "flex", alignItems: "center", paddingLeft: 22,
        background: `rgba(196,112,79,${Math.min(0.18, absX / 480)})`,
        opacity: isPassSide ? swipeRatio : 0,
        pointerEvents: "none",
        transition: isDragging ? "none" : "opacity 0.15s",
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.1em", color: C.terraDark,
        }}>
          ✕ Pass
        </span>
      </div>

      {/* Later background (right swipe) */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 16,
        display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 22,
        background: `rgba(75,115,82,${Math.min(0.18, absX / 480)})`,
        opacity: isLaterSide ? swipeRatio : 0,
        pointerEvents: "none",
        transition: isDragging ? "none" : "opacity 0.15s",
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.1em", color: C.sageDark,
        }}>
          Later →
        </span>
      </div>

      {/* Row card */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={e => { if (e.key === "Enter") onViewDetails(event.id); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          display: "flex", alignItems: "flex-start", gap: 0,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          cursor: "pointer",
          userSelect: "none",
          touchAction: "pan-y",
          transform: `translateX(${translateX}px)`,
          opacity,
          transition,
          boxShadow: shadow.sm,
          outline: "none",
          overflow: "hidden",
        }}
      >
        {/* Date column */}
        <div style={{
          flexShrink: 0, width: 64,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
          padding: "16px 0 16px",
          borderRight: `1px solid ${C.border}`,
          background: C.surfaceWarm,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.08em", color: C.terra, lineHeight: 1,
            marginBottom: 2,
          }}>
            {monthLabel}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: C.text }}>
            {dayLabel}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, padding: "14px 14px 14px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 3, lineHeight: 1.35 }}>
            {event.title}
          </div>
          <div style={{ fontSize: 12, color: C.textLight, marginBottom: 8 }}>
            {timeLabel}{endLabel ? ` – ${endLabel}` : ""}
            {event.location ? (
              <span style={{ color: C.textMuted }}> · {event.location}</span>
            ) : null}
            {event.organizer ? (
              <span style={{ color: C.textMuted }}> · {event.organizer}</span>
            ) : null}
          </div>

          {matchedTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: whyItMatches ? 7 : 0 }}>
              {matchedTags.map(tag => (
                <span key={tag.label} style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "2px 8px", borderRadius: 100,
                  background: C.sageLight, border: `1px solid ${C.sageBorder}`,
                  fontSize: 11, fontWeight: 600, color: C.sageDark,
                }}>
                  {tag.emoji} {tag.label}
                </span>
              ))}
            </div>
          )}

          {whyItMatches && (
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.45, fontStyle: "italic" }}>
              {whyItMatches}
            </div>
          )}
        </div>

        {/* Save button column */}
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center",
          padding: "14px 16px 14px 8px",
          alignSelf: "center",
        }}>
          <button
            type="button"
            disabled={isSaving}
            onClick={e => { e.stopPropagation(); onSave(event.id); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "7px 14px", borderRadius: 100,
              border: `1px solid ${C.sageBorder}`,
              background: C.sageLight, color: C.sageDark,
              fontSize: 12, fontWeight: 600,
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.6 : 1,
              whiteSpace: "nowrap",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = C.sage;
              (e.currentTarget as HTMLElement).style.color = "#fff";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = C.sageLight;
              (e.currentTarget as HTMLElement).style.color = C.sageDark;
            }}
          >
            🔖 Save
          </button>
        </div>
      </div>
    </div>
  );
}
