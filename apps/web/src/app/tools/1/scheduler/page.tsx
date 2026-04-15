import type { BidGuidance, ClearingPriceRecord } from "@penntools/tool-1/track4";
import { computeBidGuidance, SEED_RECORDS } from "@penntools/tool-1/track4";
import { SchedulerSection } from "../SchedulerSection";
import { loadPersistedRecords } from "../persistence";
import { buildGuidance } from "../guidance";

function buildSeedGuidance(): BidGuidance[] {
  const groups = new Map<string, ClearingPriceRecord[]>();
  for (const r of SEED_RECORDS) {
    const key = `${r.courseId}::${r.section}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .map(([key, records]) => {
      const sep      = key.indexOf("::");
      const courseId = key.slice(0, sep);
      const section  = key.slice(sep + 2);
      return computeBidGuidance(courseId, section, records);
    })
    .filter((g): g is BidGuidance => g !== null);
}

export default function SchedulerPage() {
  const persisted = loadPersistedRecords();
  const isUsingRealData = persisted.length > 0;
  const guidance = isUsingRealData ? buildGuidance(persisted) : buildSeedGuidance();

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f4f6fb" }}>
      {/* Top nav */}
      <div style={{ background: "#011F5B", height: 56, display: "flex", alignItems: "center", padding: "0 32px", gap: 12 }}>
        <a href="/tools/1" style={{ fontSize: 15, fontWeight: 700, color: "#fff", textDecoration: "none" }}>PennTools</a>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <a href="/tools/1" style={{ fontSize: 14, color: "#93b4e0", textDecoration: "none" }}>CourseMatch Assist</a>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <span style={{ fontSize: 14, color: "#fff" }}>Schedule Builder</span>
      </div>

      <SchedulerSection guidance={guidance} />
    </div>
  );
}
