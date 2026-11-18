// LIGHT WEEK: a normal class load and not much else. Lives near campus (40th &
// Locust), no building gym, likes morning workouts, and dismissed a Tuesday
// 7am slot in an earlier week.
//
// Busy: core classes, a Learning Team meeting Tuesday afternoon, a club lunch
// Friday and brunch Saturday: about 18 of 108.5 waking hours (~0.17).
//
// A GOOD PLAN:
// - finds all 3 sessions of 45 minutes, so the target is met with no reason;
// - spreads them out: no two on the same day or on back-to-back days
//   (e.g. Mon / Wed / Fri, or Tue / Fri / Sun);
// - mostly mornings, as preferred: at least 2 of the 3 start before noon;
// - nothing in the dismissed Tuesday 07:00-08:00 window;
// - campus facilities (Pottruck and co.), a short walk from home or class;
// - the week is not busy.

import { coreClasses, event, planInput } from "./build.js";

export const lightWeek = planInput({
  busyBlocks: [
    ...coreClasses(),
    event("TUE", "15:30", "17:00", "Learning Team meeting", "CAMPUS"),
    event("FRI", "12:00", "13:00", "Wharton Tech Club lunch", "CAMPUS"),
    event("SAT", "11:00", "13:00", "Brunch with cohort", "CENTER_CITY"),
  ],
  shared: { homeBase: "CAMPUS", homeCorner: { street: 40, crossStreet: "Locust" } },
  outtake: { preferredTimes: ["MORNING"] },
  dismissed: [{ weekday: "TUE", start: "07:00", end: "08:00" }],
});
