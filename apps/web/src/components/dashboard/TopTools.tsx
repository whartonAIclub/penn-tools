"use client";

// The home page's top tools: a card for this week and one for this month, each
// a podium of the three most-visited tools, with gold, silver and bronze cups
// and the winner in the middle. A step's height shows its place, not its
// visits, which are printed under each tool's name. Below the cards, a link to
// every tool's counts on /stats. A period with no visits has no card; with
// neither, the section isn't shown.

import { useId } from "react";
import Link from "next/link";
import { TOP_TOOL_PERIODS, type RankedTool, type TopTools } from "@/lib/topTools";
import { ToolLink } from "./ToolLink";
import styles from "./TopTools.module.css";

/** The podium's places, in rank order; CSS puts 2nd on the left and 3rd on the right. */
const PLACES = [
  { label: "1st", metal: "gold" },
  { label: "2nd", metal: "silver" },
  { label: "3rd", metal: "bronze" },
] as const;

type Metal = (typeof PLACES)[number]["metal"];

/** Each metal's cup gradient: highlight, body, and the darker edge. */
const CUP_COLORS: Record<Metal, [string, string, string]> = {
  gold: ["#fff1b8", "#f2b705", "#a87400"],
  silver: ["#ffffff", "#b9c1cc", "#6f7a89"],
  bronze: ["#f8d2b0", "#c8783f", "#86461a"],
};

function visitCount(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "visit" : "visits"}`;
}

export function TopToolsSection({ top }: { top: TopTools }) {
  const periods = [
    { key: "week", title: "Top this week", window: `Last ${TOP_TOOL_PERIODS.week} days`, icon: <FlameIcon />, ranked: top.week },
    { key: "month", title: "Top this month", window: `Last ${TOP_TOOL_PERIODS.month} days`, icon: <CalendarIcon />, ranked: top.month },
  ].filter((period) => period.ranked.length > 0);
  if (periods.length === 0) return null;

  return (
    <section className={styles.top} aria-label="Most-visited tools">
      <div className={styles.cards}>
        {periods.map((period) => (
          <article key={period.key} className={styles.card}>
            <header className={styles.cardHead}>
              <span className={styles.icon} aria-hidden="true">{period.icon}</span>
              <h2 className={styles.cardTitle}>{period.title}</h2>
              <span className={styles.window}>{period.window}</span>
            </header>
            <ol className={styles.podium}>
              {PLACES.map((place, i) => (
                <Place key={place.label} rank={i + 1} label={place.label} metal={place.metal} entry={period.ranked[i]} />
              ))}
            </ol>
          </article>
        ))}
      </div>
      <Link href="/stats" className={styles.statsLink}>
        See all tool stats
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>
    </section>
  );
}

function Place({ rank, label, metal, entry }: { rank: number; label: string; metal: Metal; entry: RankedTool | undefined }) {
  // A place no tool reached keeps its step, without a cup.
  return (
    <li className={`${styles.place} ${styles[metal]}`} aria-hidden={entry ? undefined : true}>
      {entry && (
        <ToolLink tool={entry.tool} className={styles.winner}>
          <Cup metal={metal} />
          <span className={styles.name}>
            <span className={styles.srOnly}>{label} place: </span>
            {entry.tool.title}
          </span>
          <span className={styles.visits}>{visitCount(entry.visits)}</span>
        </ToolLink>
      )}
      <span className={styles.step} aria-hidden="true">{rank}</span>
    </li>
  );
}

function Cup({ metal }: { metal: Metal }) {
  const id = useId();
  const [light, body, edge] = CUP_COLORS[metal];
  return (
    <svg className={styles.cup} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.55" stopColor={body} />
          <stop offset="1" stopColor={edge} />
        </linearGradient>
      </defs>
      {/* Handles */}
      <path d="M13 11H8.5a4 4 0 0 0 0 8c2 0 4 1.5 5 3.5M35 11h4.5a4 4 0 0 1 0 8c-2 0-4 1.5-5 3.5" fill="none" stroke={edge} strokeWidth="2.5" strokeLinecap="round" />
      {/* Bowl, stem and base */}
      <path d="M12 6h24v9a12 12 0 0 1-24 0Z" fill={`url(#${id}-metal)`} stroke={edge} strokeWidth="1.2" />
      <path d="M21.5 26.5h5v6h-5Z" fill={`url(#${id}-metal)`} stroke={edge} strokeWidth="1.2" />
      <path d="M16 32.5h16a2 2 0 0 1 2 2V39H14v-4.5a2 2 0 0 1 2-2Z" fill={`url(#${id}-metal)`} stroke={edge} strokeWidth="1.2" />
      <path d="M11 39h26v3H11Z" fill={edge} />
      {/* Shine */}
      <path d="M16.5 9.5v5.5a7.5 7.5 0 0 0 3 6" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
