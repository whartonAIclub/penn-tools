export type TagDef = { label: string; emoji: string; keywords: string[] };

export const TAGS: TagDef[] = [
  { label: "Networking", emoji: "🤝", keywords: ["network", "connect", "reception", "mixer", "meet and greet"] },
  { label: "Career",     emoji: "💼", keywords: ["career", "job", "recruiting", "recruitment", "intern", "hire", "employment", "placement"] },
  { label: "Finance",    emoji: "📈", keywords: ["finance", "invest", "banking", "private equity", "hedge fund", "venture capital", "pe ", " vc ", "asset management"] },
  { label: "Consulting", emoji: "🧠", keywords: ["consult", "strategy", "mckinsey", "bain", "bcg", "deloitte", "advisory", "management consulting"] },
  { label: "Social",     emoji: "🎉", keywords: ["social", "party", "happy hour", "celebration", "dinner", "lunch", "coffee", "drinks", "gala", "welcome"] },
  { label: "Speaker",    emoji: "🎙️", keywords: ["speaker", "panel", "lecture", "fireside", "keynote", "talk", "presentation", "seminar", "workshop"] },
  { label: "Leadership", emoji: "⭐", keywords: ["leadership", "management", "executive", "ceo", "founder", "entrepreneur", "c-suite"] },
  { label: "Tech",       emoji: "💻", keywords: ["technology", "tech", "startup", "ai ", "artificial intelligence", "software", "digital", "innovation", "data"] },
  { label: "Real Estate",emoji: "🏢", keywords: ["real estate", "property", "realty", "housing", "reit"] },
  { label: "Healthcare", emoji: "🏥", keywords: ["health", "medical", "pharma", "biotech", "life science", "clinical", "hospital"] },
];

export function matchesTags(
  event: { title: string; description?: string | null; organizer?: string | null },
  selectedTags: string[],
): boolean {
  if (selectedTags.length === 0) return true;
  const text = [event.title, event.description ?? "", event.organizer ?? ""]
    .join(" ").toLowerCase();
  return selectedTags.some(label => {
    const def = TAGS.find(t => t.label === label);
    return def ? def.keywords.some(kw => text.includes(kw.toLowerCase())) : false;
  });
}
