// RECRUITING-HEAVY WEEK: fall recruiting at its peak. Classes plus corporate
// presentations every weekday evening, coffee chats squeezed into lunch and
// late afternoon, case practice at night, a Friday of firm visits and a social
// weekend. Lives near campus (38th & Spruce), no building gym, no time preference.
//
// Busy: about 57 of 108.5 waking hours (~0.53), over the 0.5 busy threshold.
// The gaps that are left: early mornings before class (Tue and Thu are free
// until 10:15), Saturday afternoon and Sunday morning.
//
// A GOOD PLAN (normal mode):
// - still finds all 3 sessions of 45 minutes, in those early mornings and
//   weekend gaps;
// - none on Mon-Thu evenings (presentations and case practice fill them);
// - none ending less than 30 minutes before the next commitment, so nobody
//   rushes into a coffee chat or presentation sweaty;
// - no two on the same day;
// - the week counts as busy.
//
// A GOOD PLAN (crunch mode):
// - 2 short sessions of 20-30 minutes, as the spec's crunch target;
// - close to where the user already is: 10 minutes' walk or less, there and back;
// - the week counts as busy.

import { coreClasses, event, planInput } from "./build.js";

const blocks = [
  ...coreClasses(),
  // Coffee chats
  event("MON", "12:00", "12:30", "Coffee chat: second-year in consulting", "CAMPUS"),
  event("TUE", "16:00", "16:30", "Coffee chat: alum at a PE fund", "CENTER_CITY"),
  event("WED", "12:00", "12:30", "Coffee chat: second-year in tech", "CAMPUS"),
  event("THU", "16:00", "16:30", "Coffee chat: alum in banking", "CENTER_CITY"),
  // Learning Team
  event("TUE", "17:00", "18:00", "Learning Team meeting", "CAMPUS"),
  event("THU", "17:00", "18:00", "Learning Team meeting", "CAMPUS"),
  // Corporate presentations
  event("MON", "18:00", "20:00", "Corporate presentation: consulting firm", "CAMPUS"),
  event("TUE", "18:00", "20:00", "Corporate presentation: investment bank", "CAMPUS"),
  event("WED", "18:00", "20:00", "Corporate presentation: tech company", "CAMPUS"),
  event("THU", "18:00", "20:00", "Corporate presentation: consulting firm", "CAMPUS"),
  // Nights
  event("MON", "20:30", "22:00", "Case practice", "CAMPUS"),
  event("TUE", "20:30", "22:30", "Club board mixer", "CENTER_CITY"),
  event("WED", "20:30", "22:00", "Case practice", "CAMPUS"),
  event("THU", "21:00", "22:30", "Cohort party", "CENTER_CITY"),
  // Friday firm visits and the weekend
  event("FRI", "09:00", "18:00", "Firm visits in Center City", "CENTER_CITY"),
  event("FRI", "19:00", "22:30", "Club dinner", "CENTER_CITY"),
  event("SAT", "10:00", "14:00", "Case prep with Learning Team", "CAMPUS"),
  event("SAT", "19:00", "22:30", "Party", "CENTER_CITY"),
  event("SUN", "12:00", "18:00", "Recruiting applications", null),
];

export const recruitingWeek = planInput({
  busyBlocks: blocks,
  shared: { homeBase: "CAMPUS", homeCorner: { street: 38, crossStreet: "Spruce" } },
});

export const recruitingWeekCrunch = planInput({
  busyBlocks: blocks,
  shared: { homeBase: "CAMPUS", homeCorner: { street: 38, crossStreet: "Spruce" } },
  crunchMode: true,
});
