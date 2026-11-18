// TREK WEEK: away Thursday to Saturday on a long-weekend trek, back Sunday
// afternoon. Classes Monday to Wednesday, a Learning Team meeting crammed in
// before leaving. Lives near campus (39th & Walnut), no building gym.
//
// A GOOD PLAN:
// - nothing on the away days (Thu, Fri, Sat);
// - still finds all 3 sessions in the four days left, without back-to-back
//   days: that means Monday, Wednesday and Sunday;
// - nothing before the flight home lands on Sunday.
//
// (Whether away days count toward busyness is an open question; the tests
// don't check it here.)

import { coreClasses, event, planInput } from "./build.js";

export const trekWeek = planInput({
  busyBlocks: [
    // Thursday's classes are missed for the trek.
    ...coreClasses().filter((block) => !block.start.startsWith("2026-11-19")),
    event("TUE", "15:30", "17:00", "Learning Team meeting", "CAMPUS"),
    event("WED", "19:00", "21:00", "Packing and trek pre-departure call", null),
    event("SUN", "07:00", "14:00", "Flight home from trek", null),
  ],
  awayDays: ["THU", "FRI", "SAT"],
  shared: { homeBase: "CAMPUS", homeCorner: { street: 39, crossStreet: "Walnut" } },
});
