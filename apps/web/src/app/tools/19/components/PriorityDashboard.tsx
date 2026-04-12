"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { C, shadow } from "../lib/tokens";
import { formatDate, formatTime } from "../lib/format";
import { usePriorityHealth } from "../hooks/usePriorityHealth";
import type { PriorityHealth, PriorityStatus } from "../hooks/usePriorityHealth";
import type { EventItem, ReflectionItem } from "../lib/types";

// ── Static content tables ─────────────────────────────────────────────────────

const REFLECTION_PROMPTS: Record<string, string[]> = {
  Networking:    ["Who did I meet recently that I want to stay in touch with?", "What's one genuine connection I made this week?", "How am I showing up in my professional relationships?"],
  Career:        ["What career direction am I leaning toward right now?", "Which conversation gave me new clarity this week?", "What skill am I actively developing through my activities?"],
  Finance:       ["What financial insight from a recent event stuck with me?", "Am I building the knowledge base I need for this path?", "What would I need to learn to feel more confident here?"],
  Consulting:    ["What frameworks or approaches am I picking up?", "How am I building credibility in this space?", "What case prep or exposure have I had recently?"],
  Social:        ["When did I last let myself just have fun and connect?", "Am I investing in friendships alongside my career goals?", "What community moment has meant the most to me lately?"],
  Speaker:       ["What idea from a recent talk stayed with me?", "How am I applying what I've learned from speakers?", "What topic would push my thinking the most right now?"],
  Leadership:    ["Where am I stepping up and taking ownership?", "What leadership lesson am I learning right now?", "How am I supporting others in my cohort?"],
  Tech:          ["What technology trend feels most relevant to my goals?", "How am I staying current in a rapidly changing space?", "What's one technical skill I want to build this semester?"],
  "Real Estate": ["What market dynamics am I paying attention to?", "How am I building my real estate knowledge and network?", "What deal or concept has sparked my curiosity recently?"],
  Healthcare:    ["What healthcare challenge motivates me most right now?", "How am I building relationships in this space?", "What shifted my perspective on healthcare recently?"],
};

const NUDGES: Record<PriorityStatus, string[]> = {
  fading:   ["Attend just one relevant event this week — momentum starts small.", "Reach out to one person in this space you've been meaning to connect with.", "Block 20 minutes to reflect on why this priority matters to you."],
  stagnant: ["Save an upcoming event that genuinely excites you in this area.", "Write a short reflection on your last related experience.", "Set one small, concrete goal for this priority this week."],
  growing:  ["Keep the momentum — you're making real progress.", "Reflect on what's working so you can do more of it.", "Invite someone else into this journey with you."],
  thriving: ["You're doing great here — share what's working with a classmate.", "Use this strength to lift up a priority that needs attention.", "Reflect on how you got here — it's worth capturing."],
};

const DRILL_TITLES: Record<PriorityStatus, string> = {
  thriving: "🌸 keep blooming",
  growing:  "🌿 grow me even more",
  stagnant: "💧 i need some watering",
  fading:   "🥀 bring me back to life",
};

const BAR_COLORS: Record<PriorityStatus, { bar: string; text: string; bg: string; border: string }> = {
  thriving: { bar: "linear-gradient(to top, #3F6C46, #9FC4A3)", text: C.sageDark,   bg: C.sageLight,  border: C.sageBorder  },
  growing:  { bar: "linear-gradient(to top, #7A9E7E, #C5D8C7)", text: C.sage,       bg: C.sageLight,  border: C.sageBorder  },
  stagnant: { bar: "linear-gradient(to top, #B5A898, #DDD8D2)", text: C.textMuted,  bg: C.surfaceWarm, border: C.stoneBorder },
  fading:   { bar: "linear-gradient(to top, #C4704F, #E8C5B0)", text: C.terraDark,  bg: C.terraLight, border: C.terraBorder  },
};

// ── Status explanation ────────────────────────────────────────────────────────

function statusExplanation(p: PriorityHealth): string {
  if (p.savedCount === 0) {
    return `You haven't saved any ${p.label.toLowerCase()} events yet. Start browsing to build momentum here.`;
  }
  if (p.status === "thriving") {
    return `You've been consistently engaging with ${p.label.toLowerCase()} — ${p.savedCount} events saved${p.reflectedCount > 0 ? `, ${p.reflectedCount} reflected on` : ""}. Keep it up!`;
  }
  if (p.status === "growing") {
    return `${p.label} is picking up steam. A bit more engagement and reflection and you'll be thriving.`;
  }
  if (p.status === "stagnant") {
    const dayText = p.lastActivityDays !== null ? ` You last engaged ${p.lastActivityDays} day${p.lastActivityDays !== 1 ? "s" : ""} ago.` : "";
    return `${p.label} hasn't seen much movement lately.${dayText} A little attention goes a long way.`;
  }
  // fading
  if (p.lastActivityDays !== null && p.lastActivityDays > 14) {
    return `This priority has weakened — you haven't engaged with related events in ${p.lastActivityDays} day${p.lastActivityDays !== 1 ? "s" : ""}. Time to revive it.`;
  }
  return `${p.label} needs attention. Save and attend relevant events, then reflect on them to build strength here.`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ── Priority bar ──────────────────────────────────────────────────────────────

function PriorityBar({
  priority,
  isSelected,
  onClick,
}: {
  priority: PriorityHealth;
  isSelected: boolean;
  onClick: () => void;
}) {
  const colors = BAR_COLORS[priority.status];
  const barHeight = Math.max(12, (priority.score / 100) * 120);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
        padding: "12px 8px 14px",
        borderRadius: 18,
        border: `2px solid ${isSelected ? colors.border : "transparent"}`,
        background: isSelected ? colors.bg : "transparent",
        cursor: "pointer",
        transition: "all 0.2s",
        outline: "none",
        boxShadow: isSelected ? `0 0 0 3px ${colors.border}` : "none",
      }}
      onMouseEnter={e => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = colors.bg;
          (e.currentTarget as HTMLElement).style.borderColor = colors.border;
        }
      }}
      onMouseLeave={e => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
        }
      }}
    >
      {/* Emoji */}
      <div style={{ fontSize: 22, marginBottom: 10, lineHeight: 1 }}>
        {priority.emoji}
      </div>

      {/* Bar track + fill */}
      <div style={{
        width: "100%",
        height: 140,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        position: "relative",
        marginBottom: 10,
      }}>
        {/* Track (ghost) */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "50%",
          transform: "translateX(-50%)",
          width: 40, height: 140,
          borderRadius: 10,
          background: "rgba(44,26,14,0.05)",
        }} />
        {/* Fill */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "50%",
          transform: "translateX(-50%)",
          width: 40,
          height: barHeight,
          borderRadius: "8px 8px 3px 3px",
          background: colors.bar,
          boxShadow: isSelected ? `0 4px 14px ${colors.border}` : "none",
          transition: "height 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }} />
        {/* Score label inside bar if tall enough */}
        {barHeight >= 30 && (
          <div style={{
            position: "absolute",
            bottom: barHeight - 22,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 9, fontWeight: 700,
            color: priority.status === "fading" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.85)",
            lineHeight: 1,
            pointerEvents: "none",
            zIndex: 1,
          }}>
            {priority.score}
          </div>
        )}
      </div>

      {/* Label */}
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4, textAlign: "center" }}>
        {priority.label}
      </div>

      {/* Status badge */}
      <div style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 100,
        fontSize: 10, fontWeight: 600,
        textTransform: "uppercase" as const,
        letterSpacing: "0.07em",
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}>
        {priority.status}
      </div>
    </button>
  );
}

// ── Drill-down panel ──────────────────────────────────────────────────────────

function DrillDown({
  priority,
  savedEventIds,
  onSaveEvent,
  onStartReflection,
  actionItems,
  onToggleActionItem,
}: {
  priority: PriorityHealth;
  savedEventIds: Set<string>;
  onSaveEvent: (eventId: string) => void;
  onStartReflection: (eventId: string) => void;
  actionItems: Set<string>;
  onToggleActionItem: (id: string) => void;
}) {
  const colors = BAR_COLORS[priority.status];
  const prompts = REFLECTION_PROMPTS[priority.label] ?? REFLECTION_PROMPTS["Career"] ?? [];
  const nudges = NUDGES[priority.status];

  return (
    <div style={{
      marginTop: 20,
      borderRadius: 20,
      border: `1px solid ${colors.border}`,
      background: C.surface,
      overflow: "hidden",
      boxShadow: shadow.md,
      animation: "fadeSlideIn 0.2s ease-out",
    }}>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "16px 24px",
        background: `linear-gradient(90deg, ${colors.bg} 0%, transparent 70%)`,
        borderBottom: `1px solid ${colors.border}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: colors.text, marginBottom: 4 }}>
            {DRILL_TITLES[priority.status]}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            {priority.emoji} {priority.label}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.55, maxWidth: 520 }}>
            {statusExplanation(priority)}
          </p>
        </div>
        <div style={{
          fontSize: 28, fontWeight: 800,
          color: colors.text, opacity: 0.25,
          lineHeight: 1, flexShrink: 0,
        }}>
          {priority.score}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── Upcoming events ── */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.taupe, marginBottom: 12 }}>
            Upcoming events to explore
          </div>

          {priority.relatedUpcoming.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.textLight }}>
              No upcoming {priority.label.toLowerCase()} events right now. Check back soon or browse below.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {priority.relatedUpcoming.slice(0, 3).map(ev => (
                <div key={ev.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  padding: "10px 14px", borderRadius: 12,
                  border: `1px solid ${C.border}`, background: C.surfaceWarm,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {ev.title}
                    </div>
                    <div style={{ fontSize: 11, color: C.textLight }}>
                      {formatDate(ev.start_time)} · {formatTime(ev.start_time)}
                      {ev.organizer && <span> · {ev.organizer}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSaveEvent(ev.id)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "5px 12px", borderRadius: 8, flexShrink: 0,
                      border: savedEventIds.has(ev.id) ? `1px solid ${C.sageBorder}` : `1px solid ${C.border}`,
                      background: savedEventIds.has(ev.id) ? C.sageLight : C.surface,
                      color: savedEventIds.has(ev.id) ? C.sageDark : C.textMuted,
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => {
                      if (!savedEventIds.has(ev.id)) {
                        (e.currentTarget as HTMLElement).style.borderColor = C.sageBorder;
                        (e.currentTarget as HTMLElement).style.color = C.sageDark;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!savedEventIds.has(ev.id)) {
                        (e.currentTarget as HTMLElement).style.borderColor = C.border;
                        (e.currentTarget as HTMLElement).style.color = C.textMuted;
                      }
                    }}
                  >
                    {savedEventIds.has(ev.id) ? <><CheckIcon /> Saved</> : "Save event"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Reflection prompts + Nudges ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Reflection prompts */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.taupe, marginBottom: 12 }}>
              Reflect on this
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {prompts.map((prompt, i) => {
                const itemId = `prompt-${priority.label}-${i}`;
                const saved = actionItems.has(itemId);
                return (
                  <div key={itemId} style={{
                    padding: "10px 14px", borderRadius: 12,
                    border: `1px solid ${saved ? C.sageBorder : C.borderMuted}`,
                    background: saved ? C.sageLight : C.surfaceMuted,
                    transition: "all 0.15s",
                  }}>
                    <p style={{ margin: "0 0 8px", fontSize: 12, lineHeight: 1.55, color: C.textMuted, fontStyle: "italic" }}>
                      "{prompt}"
                    </p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => onToggleActionItem(itemId)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "4px 10px", borderRadius: 6,
                          border: `1px solid ${saved ? C.sageBorder : C.border}`,
                          background: saved ? C.sage : "transparent",
                          color: saved ? "#fff" : C.textMuted,
                          fontSize: 10, fontWeight: 600, cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {saved ? <><CheckIcon /> Saved to week</> : <><PlusIcon /> Add to my week</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Nudges */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.taupe, marginBottom: 12 }}>
              Nudges for this week
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {nudges.map((nudge, i) => {
                const itemId = `nudge-${priority.label}-${i}`;
                const saved = actionItems.has(itemId);
                return (
                  <div key={itemId} style={{
                    padding: "10px 14px", borderRadius: 12,
                    border: `1px solid ${saved ? C.sageBorder : C.borderMuted}`,
                    background: saved ? C.sageLight : C.surfaceMuted,
                    transition: "all 0.15s",
                  }}>
                    <p style={{ margin: "0 0 8px", fontSize: 12, lineHeight: 1.55, color: C.textMuted }}>
                      {nudge}
                    </p>
                    <button
                      type="button"
                      onClick={() => onToggleActionItem(itemId)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 10px", borderRadius: 6,
                        border: `1px solid ${saved ? C.sageBorder : C.border}`,
                        background: saved ? C.sage : "transparent",
                        color: saved ? "#fff" : C.textMuted,
                        fontSize: 10, fontWeight: 600, cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {saved ? <><CheckIcon /> Saved to week</> : <><PlusIcon /> Add to my week</>}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Action items summary */}
        {actionItems.size > 0 && (
          <div style={{
            padding: "10px 16px", borderRadius: 12,
            border: `1px solid ${C.sageBorder}`, background: C.sageLight,
            fontSize: 12, color: C.sageDark, display: "flex", alignItems: "center", gap: 8,
          }}>
            <CheckIcon />
            <span>
              <strong>{actionItems.size}</strong> item{actionItems.size !== 1 ? "s" : ""} saved to your week
              {" · "}
              <button
                type="button"
                onClick={() => {
                  for (const id of actionItems) onToggleActionItem(id);
                }}
                style={{ background: "none", border: "none", color: C.sageDark, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}
              >
                clear all
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type PriorityDashboardProps = {
  events: EventItem[];
  savedEvents: EventItem[];
  reflectionsByEventId: Record<string, ReflectionItem>;
  savedEventIds: Set<string>;
  onSaveEvent: (eventId: string) => void;
  onStartReflection: (eventId: string) => void;
};

export function PriorityDashboard({
  events,
  savedEvents,
  reflectionsByEventId,
  savedEventIds,
  onSaveEvent,
  onStartReflection,
}: PriorityDashboardProps) {
  const [userName, setUserName] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [actionItems, setActionItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then((data: unknown) => {
        if (data && typeof data === "object" && "name" in data && typeof (data as { name: unknown }).name === "string") {
          setUserName((data as { name: string }).name);
        }
      })
      .catch(() => {});
  }, []);

  const { priorities, summary } = usePriorityHealth({ events, savedEvents, reflectionsByEventId });

  const activePriority = useMemo(
    () => priorities.find(p => p.label === selectedPriority) ?? null,
    [priorities, selectedPriority]
  );

  const handleToggleActionItem = (id: string) => {
    setActionItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBarClick = (label: string) => {
    setSelectedPriority(prev => prev === label ? null : label);
  };

  return (
    <header style={{
      position: "relative",
      overflow: "hidden",
      borderRadius: 28,
      border: `1px solid ${C.border}`,
      background: "linear-gradient(135deg, #ffffff 0%, #fdfcfa 50%, #eee9e0 100%)",
      padding: "36px 40px",
      marginBottom: 32,
      boxShadow: shadow.md,
    }}>
      {/* Decorative blobs */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: -60, right: -60,
          width: 280, height: 280, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(122,158,126,0.18) 0%, transparent 70%)",
          filter: "blur(32px)",
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: -80,
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(196,112,79,0.10) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
      </div>

      <div style={{ position: "relative" }}>
        {/* Welcome header */}
        <div style={{ marginBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>
            {userName ? `Welcome, ${userName}.` : "Welcome back."}
          </h1>
        </div>

        {/* Summary sentence */}
        <p style={{
          margin: "0 0 32px",
          fontSize: 14, lineHeight: 1.6, color: C.textMuted,
          maxWidth: 520,
        }}>
          {summary}
        </p>

        {/* Priority bars */}
        <div style={{
          display: "flex",
          gap: 8,
          alignItems: "stretch",
          marginBottom: activePriority ? 4 : 0,
        }}>
          {priorities.map(p => (
            <PriorityBar
              key={p.label}
              priority={p}
              isSelected={selectedPriority === p.label}
              onClick={() => handleBarClick(p.label)}
            />
          ))}

          {/* Hint */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            paddingBottom: 40,
            paddingLeft: 12,
          }}>
            <p style={{ margin: 0, fontSize: 11, color: C.taupe, maxWidth: 100, lineHeight: 1.5 }}>
              Click a priority to see recommendations
            </p>
          </div>
        </div>

        {/* Drill-down */}
        {activePriority && (
          <DrillDown
            priority={activePriority}
            savedEventIds={savedEventIds}
            onSaveEvent={onSaveEvent}
            onStartReflection={onStartReflection}
            actionItems={actionItems}
            onToggleActionItem={handleToggleActionItem}
          />
        )}
      </div>
    </header>
  );
}
