// The engine review (step 6 of docs/outtake.md): prints each fixture week's
// plan, in normal and crunch mode, with every day's best slot and its score
// part by part, so the weights in ENGINE_CONFIG can be tuned by eye.
//
// Run with `pnpm --filter @penntools/tool-penn-fitness engine-review`, which
// builds first: this reads the compiled engine and fixtures from dist/.

import { ENGINE_CONFIG, bestSlotPerDay, explainSlot, planWeek, spreadPoints } from "../dist/outtake/engine/index.js";
import { centerCityWeek } from "../dist/outtake/engine/__tests__/fixtures/centerCityWeek.js";
import { lightWeek } from "../dist/outtake/engine/__tests__/fixtures/lightWeek.js";
import { noGapsWeek } from "../dist/outtake/engine/__tests__/fixtures/noGapsWeek.js";
import { recruitingWeek } from "../dist/outtake/engine/__tests__/fixtures/recruitingWeek.js";
import { trekWeek } from "../dist/outtake/engine/__tests__/fixtures/trekWeek.js";

const WEEKS = [
  ["Light week", lightWeek],
  ["Recruiting-heavy week", recruitingWeek],
  ["Trek week", trekWeek],
  ["Center City user", centerCityWeek],
  ["No viable gaps", noGapsWeek],
];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayName = (time) => DAY_NAMES[(new Date(time.slice(0, 10) + "T12:00:00Z").getUTCDay() + 6) % 7];
const signed = (n) => (n === 0 ? "0" : (n > 0 ? "+" : "") + n.toFixed(2));
const pad = (value, width, right = false) => (right ? String(value).padStart(width) : String(value).padEnd(width));

function review(name, input) {
  const config = ENGINE_CONFIG;
  const plan = planWeek(input, config);
  const chosen = new Set(plan.slots.map((slot) => slot.start));
  const mode = input.crunchMode ? "CRUNCH" : "normal";
  const sessionText = input.crunchMode
    ? `${config.plan.crunch.sessions} sessions of ${config.plan.crunch.shortestMinutes}-${Math.min(config.plan.crunch.longestMinutes, input.sessionMinutes)} min`
    : `${input.weeklyTargetSessions} sessions of ${input.sessionMinutes} min`;

  console.log(`\n=== ${name} · ${mode} ${"=".repeat(Math.max(0, 66 - name.length - mode.length))}`);
  console.log(
    `Busyness ${plan.busyness.toFixed(2)} (${plan.isBusy ? "busy" : "not busy"}${input.crunchMode ? ", crunch" : ""})` +
      ` · target ${sessionText} · ${plan.targetMet ? "met" : "NOT met"}`,
  );
  console.log(`Spread out: ${input.spreadOut ? "yes" : "no, days in a row are fine"}`);
  if (input.preferredWindows.length) console.log(`Prefers: ${input.preferredWindows.map((w) => `${w.start}-${w.end}`).join(", ")}`);
  if (input.dismissed.length) console.log(`Dismissed before: ${input.dismissed.map((d) => `${d.weekday} ${d.start}-${d.end}`).join(", ")}`);
  if (input.awayDays.length) console.log(`Away: ${input.awayDays.map((d) => dayName(d + "T00:00")).join(", ")}`);

  const candidates = bestSlotPerDay(input, config);
  if (candidates.length === 0) {
    console.log("No day has a gap long enough for a session.");
  } else {
    console.log("Best slot each day (* = in the plan):");
    console.log(`     day  time          ${pad("place", 16)}${pad("walk", 6, true)}${pad("pref", 8, true)}${pad("travel", 8, true)}${pad("buffer", 8, true)}${pad("dismiss", 9, true)}${pad("total", 8, true)}`);
    for (const slot of candidates) {
      const parts = explainSlot(slot, input, config);
      const time = `${slot.start.slice(11)}-${slot.end.slice(11)}`;
      console.log(
        `  ${chosen.has(slot.start) ? "*" : " "}  ${dayName(slot.start)}  ${pad(time, 14)}${pad(slot.placeId, 16)}${pad(slot.travelMinutes + "m", 6, true)}` +
          `${pad(signed(parts.preferredTime), 8, true)}${pad(signed(parts.travel), 8, true)}${pad(signed(parts.buffer), 8, true)}` +
          `${pad(signed(parts.dismissed), 9, true)}${pad(signed(parts.total), 8, true)}`,
      );
    }
  }

  const days = plan.slots.map((slot) => DAY_NAMES.indexOf(dayName(slot.start))).sort((a, b) => a - b);
  const spacing = spreadPoints(days, input.spreadOut, config);
  const total = plan.slots.reduce((sum, slot) => sum + slot.score, 0) + spacing;
  console.log(
    `Plan: ${plan.slots.map((slot) => `${dayName(slot.start)} ${slot.start.slice(11)}`).join(", ") || "(empty)"}` +
      ` · spacing ${signed(spacing)} · total ${signed(total)}`,
  );
  console.log(`Reason: ${plan.reason ?? "(none, target met)"}`);
}

console.log("Engine settings (ENGINE_CONFIG in src/outtake/engine/config.ts):");
console.log(JSON.stringify(ENGINE_CONFIG, null, 1).replace(/\n\s*/g, " "));
for (const [name, input] of WEEKS) {
  review(name, input);
  review(name, { ...input, crunchMode: true });
}
