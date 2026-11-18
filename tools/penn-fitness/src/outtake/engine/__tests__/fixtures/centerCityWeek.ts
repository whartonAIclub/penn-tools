// CENTER CITY USER: lives near Rittenhouse Square (19th & Walnut) in a
// building with a gym, and walks over the river for classes on campus. The
// typical case from the spec: Pottruck is a detour from home, the building gym
// isn't. Ordinary class load, Rittenhouse plans at the weekend.
//
// A GOOD PLAN:
// - finds all 3 sessions;
// - never makes a special trip across the river to work out: on class days it
//   uses a campus facility in a gap between classes (e.g. Monday 11:35-13:45),
//   otherwise the building gym at home, so each slot is 10 minutes' walk or
//   less, there and back;
// - no two on the same day.

import { coreClasses, event, planInput } from "./build.js";

export const centerCityWeek = planInput({
  busyBlocks: [
    ...coreClasses(),
    event("TUE", "15:30", "17:00", "Learning Team meeting", "CAMPUS"),
    event("THU", "18:30", "20:30", "Dinner with classmates in Rittenhouse", "CENTER_CITY"),
    event("SAT", "11:00", "13:00", "Brunch in Rittenhouse", "CENTER_CITY"),
    event("SAT", "20:00", "22:30", "Party in Rittenhouse", "CENTER_CITY"),
  ],
  shared: { homeBase: "CENTER_CITY", homeCorner: { street: 19, crossStreet: "Walnut" }, hasBuildingGym: true },
});
