import { useMemo } from "react";
import { TAGS, matchesTags } from "../lib/tags";
import type { EventItem, ReflectionItem } from "../lib/types";

export type PriorityStatus = "thriving" | "growing" | "stagnant" | "fading";

export type PriorityHealth = {
  label: string;
  emoji: string;
  score: number;
  status: PriorityStatus;
  savedCount: number;
  reflectedCount: number;
  upcomingCount: number;
  lastActivityDays: number | null;
  relatedSaved: EventItem[];
  relatedUpcoming: EventItem[];
};

type Args = {
  events: EventItem[];
  savedEvents: EventItem[];
  reflectionsByEventId: Record<string, ReflectionItem>;
};

export function usePriorityHealth({ events, savedEvents, reflectionsByEventId }: Args) {
  const priorities = useMemo(() => {
    const now = Date.now();

    const allScores: PriorityHealth[] = TAGS.map(tag => {
      const relatedSaved = savedEvents.filter(e => matchesTags(e, [tag.label]));
      const pastSaved = relatedSaved.filter(e => new Date(e.start_time).getTime() < now);
      const upcomingSaved = relatedSaved.filter(e => new Date(e.start_time).getTime() >= now);

      const reflectedCount = relatedSaved.filter(e => reflectionsByEventId[e.id]).length;

      let lastActivityDays: number | null = null;
      if (pastSaved.length > 0) {
        const mostRecent = Math.max(...pastSaved.map(e => new Date(e.start_time).getTime()));
        lastActivityDays = Math.floor((now - mostRecent) / (1000 * 60 * 60 * 24));
      }

      const recencyBonus =
        lastActivityDays === null ? 0 :
        lastActivityDays <= 7  ? 15 :
        lastActivityDays <= 14 ? 8  :
        lastActivityDays <= 30 ? 3  : 0;

      const score = Math.min(100,
        relatedSaved.length * 15 +
        reflectedCount * 18 +
        recencyBonus +
        upcomingSaved.length * 10
      );

      const status: PriorityStatus =
        score >= 75 ? "thriving" :
        score >= 50 ? "growing"  :
        score >= 25 ? "stagnant" : "fading";

      const relatedUpcoming = events
        .filter(e => matchesTags(e, [tag.label]) && new Date(e.start_time).getTime() >= now)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        .slice(0, 5);

      return {
        label: tag.label,
        emoji: tag.emoji,
        score,
        status,
        savedCount: relatedSaved.length,
        reflectedCount,
        upcomingCount: upcomingSaved.length,
        lastActivityDays,
        relatedSaved,
        relatedUpcoming,
      };
    });

    const hasActivity = savedEvents.length > 0;

    if (!hasActivity) {
      const defaults = ["Career", "Networking", "Social"];
      return defaults.map(label => allScores.find(p => p.label === label)!);
    }

    return [...allScores].sort((a, b) => b.score - a.score).slice(0, 3);
  }, [events, savedEvents, reflectionsByEventId]);

  const summary = useMemo(() => {
    const hasActivity = savedEvents.length > 0;
    if (!hasActivity) return "Save events and reflect to see your priority health.";

    const scores = priorities.map(p => p.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    if (maxScore === 0) return "Save events and reflect to see your priority health.";
    if (minScore >= 70) return "You're going strong across all your priorities.";

    const best  = priorities[0]!;
    const worst = priorities[priorities.length - 1]!;

    if (best.score > 60 && worst.score < 20)
      return `${best.label} is thriving, but ${worst.label} needs some watering.`;
    if (worst.score < 20)
      return `Your ${worst.label} priority is fading — give it some attention.`;
    if (minScore >= 50)
      return "You've been spending time in ways that align well with your goals.";

    return "Keep going — your priorities are growing steadily.";
  }, [priorities, savedEvents.length]);

  return { priorities, summary };
}
