import { SEED_RECORDS } from "./src/track4/seedData.js";
import { computeBidGuidance } from "./src/track4/bidEngine.js";
import { upsertRecords, getSectionsForCourse, getAllCourseIds } from "./src/track4/store.js";
import { getBidGuidanceForBundle } from "./src/track4/bidEngine.js";

upsertRecords(SEED_RECORDS);

const courseIds = getAllCourseIds();
console.log(`\nLoaded ${SEED_RECORDS.length} records across ${courseIds.length} courses\n`);
console.log("═".repeat(62));

for (const courseId of courseIds) {
  for (const section of getSectionsForCourse(courseId)) {
    const history = SEED_RECORDS.filter(r => r.courseId === courseId && r.section === section);
    const g = computeBidGuidance(courseId, section, history);
    if (!g) continue;

    const trendArrow = g.trend === "rising" ? "↑" : g.trend === "falling" ? "↓" : "→";

    console.log(`\n${g.courseId} §${g.section}  —  ${g.title}`);
    console.log(`  Tier: ${g.tier.toUpperCase()}  (${trendArrow} ${g.trend}, ${g.volatility} volatility)`);
    console.log(`  Projected next clearing price: ~${g.projectedPrice} pts`);
    console.log();
    console.log(`  ┌─────────────────────────────────────────────────────┐`);
    console.log(`  │  BID THRESHOLDS TO CLEAR                            │`);
    console.log(`  │                                                     │`);
    console.log(`  │  ✅  Safe        bid ≥ ${String(g.thresholds.safe).padEnd(4)} pts  — very likely in    │`);
    console.log(`  │  🟡  Competitive bid ≥ ${String(g.thresholds.competitive).padEnd(4)} pts  — likely in          │`);
    console.log(`  │  🔴  Reach       bid ≥ ${String(g.thresholds.reach).padEnd(4)} pts  — risky, may miss   │`);
    console.log(`  └─────────────────────────────────────────────────────┘`);
    console.log();
    console.log(`  History:`);
    for (const { term, price } of g.historicalPrices) {
      const bar = "█".repeat(Math.round(price / 50));
      console.log(`    ${term.padEnd(12)} ${String(price).padStart(4)} pts  ${bar}`);
    }
  }
}

console.log("\n" + "═".repeat(62));
console.log("\nTrack 3 bundle simulation:");
const bundle = getBidGuidanceForBundle([
  { courseId: "FNCE611", section: "001" },
  { courseId: "MGMT611", section: "001" },
  { courseId: "UNKNOWN999", section: "001" },
]);
console.log(`  Requested 3, got ${bundle.length} (1 skipped — no data)\n`);
for (const g of bundle) {
  console.log(`  ${g.courseId}: safe≥${g.thresholds.safe}  competitive≥${g.thresholds.competitive}  reach≥${g.thresholds.reach}`);
}
console.log();
