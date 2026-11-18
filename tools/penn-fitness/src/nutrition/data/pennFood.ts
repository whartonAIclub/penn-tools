// Penn food data: Penn Dining meal plans, Penn Dining cafés and markets, and
// nearby chain restaurants with menu items and nutrition. Checked on
// FOOD_DATA_CHECKED_ON; each entry's sourceUrl is the official page it came
// from. Values Penn or the chain doesn't publish are null, unless the item is
// marked `approximate: true`: then they're a best approximation (the comment
// above the outlet's items says on what basis), and the planner says "about".
//
// Entries added on 2026-11-18 were researched through search results quoting
// the official pages, which couldn't be opened directly; their comments say so.
//
// Penn Dining doesn't publish per-item nutrition outside its live, rotating
// Bon Appétit menus, so Penn Dining items are staples named on Penn's own
// pages, with nutrition left null. Chain nutrition is for the standard build
// as listed on the chain's own nutrition pages.

import type { DiningPlan, Outlet } from "../foodData.js";

export const FOOD_DATA_CHECKED_ON = "2026-11-17";

const PLANS = "https://dining.business-services.upenn.edu/dining-plans";
const PENN_LOC = "https://dining.business-services.upenn.edu/locations-hours-menus";
const PENN_MENUS = "https://university-of-pennsylvania.cafebonappetit.com/";

const BILLING_NOTE =
  "Penn lists an annual price, billed per semester; the per-semester price here is half of it.";

export const DINING_PLANS: DiningPlan[] = [
  {
    id: "first-year-296",
    name: "First-Year 296",
    swipesPerWeek: null,
    swipesPerSemester: 296,
    diningDollarsPerSemester: 125,
    pricePerSemester: 3480,
    eligibility: "First-year students (also open to transfer, exchange and upper-level students)",
    notes: `$6,960 per year for 2026–27. About 19 meals a week; includes 10 guest swipes per semester. ${BILLING_NOTE}`,
    sourceUrl: `${PLANS}/first-year`,
  },
  {
    id: "first-year-187",
    name: "First-Year 187",
    swipesPerWeek: null,
    swipesPerSemester: 187,
    diningDollarsPerSemester: 400,
    pricePerSemester: 3480,
    eligibility: "First-year students (also open to transfer, exchange and upper-level students)",
    notes: `$6,960 per year for 2026–27. About 12 meals a week; includes 10 guest swipes per semester. ${BILLING_NOTE}`,
    sourceUrl: `${PLANS}/first-year`,
  },
  {
    id: "second-year-156",
    name: "Second-Year 156",
    swipesPerWeek: null,
    swipesPerSemester: 156,
    diningDollarsPerSemester: 300,
    pricePerSemester: 2357,
    eligibility: "Second-year students (also open to transfer, exchange and upper-level students)",
    notes: `$4,714 per year. About 10 meals a week; includes 10 guest swipes per semester. ${BILLING_NOTE}`,
    sourceUrl: `${PLANS}/second-year`,
  },
  {
    id: "upperclass-108",
    name: "Upperclass 108",
    swipesPerWeek: null,
    swipesPerSemester: 108,
    diningDollarsPerSemester: 600,
    pricePerSemester: 2570,
    eligibility: "Upper-level, transfer and exchange students",
    notes: `$5,140 per year. About 7 meals a week. ${BILLING_NOTE}`,
    sourceUrl: `${PLANS}/transfer-exchange-upperclass`,
  },
  {
    id: "upperclass-78",
    name: "Upperclass 78",
    swipesPerWeek: null,
    swipesPerSemester: 78,
    diningDollarsPerSemester: 175,
    pricePerSemester: 1595,
    eligibility: "Upper-level, transfer, exchange and graduate students",
    notes: `$3,190 per year. About 5 meals a week. ${BILLING_NOTE}`,
    sourceUrl: `${PLANS}/transfer-exchange-upperclass`,
  },
  {
    id: "upperclass-47",
    name: "Upperclass 47",
    swipesPerWeek: null,
    swipesPerSemester: 47,
    diningDollarsPerSemester: 525,
    pricePerSemester: 1404,
    eligibility: "Upper-level, transfer and exchange students",
    notes: `$2,808 per year. About 3 meals a week. ${BILLING_NOTE}`,
    sourceUrl: `${PLANS}/transfer-exchange-upperclass`,
  },
  {
    id: "dining-dollars-only",
    name: "Dining Dollars Only",
    swipesPerWeek: null,
    swipesPerSemester: null,
    diningDollarsPerSemester: 1600,
    pricePerSemester: 1600,
    eligibility: "Upper-level and graduate students",
    notes: `$3,200 per year; no meal swipes. ${BILLING_NOTE}`,
    sourceUrl: `${PLANS}/transfer-exchange-upperclass`,
  },
  {
    id: "grad-plan",
    name: "Grad Plan",
    swipesPerWeek: null,
    swipesPerSemester: null,
    diningDollarsPerSemester: 700,
    pricePerSemester: 700,
    eligibility: "Graduate students",
    notes: `$1,400 per year; Dining Dollars only, no meal swipes. Graduate students aren't required to buy a plan. ${BILLING_NOTE}`,
    sourceUrl: `${PLANS}/graduate-student`,
  },
];

/** A Penn Dining staple with no published per-item nutrition. */
function staple(name: string, dietary: Outlet["items"][number]["dietary"] = []): Outlet["items"][number] {
  return { name, calories: null, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary };
}

export const OUTLETS: Outlet[] = [
  // ── Penn Dining residential cafés (all-you-care-to-eat, swipe in) ──────────
  {
    id: "1920-commons",
    name: "1920 Commons",
    kind: "dining-hall",
    operator: "penn-dining",
    address: "3800 Locust Walk, Philadelphia, PA 19104",
    nearBuildings: ["1920 Commons", "Harnwell College House", "Harrison College House"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Breakfast, lunch and dinner most days; check Penn Dining for today's hours.",
    menuUrl: PENN_MENUS,
    items: [staple("Scrambled eggs"), staple("Breakfast potatoes")],
    sourceUrl: `${PENN_LOC}/locations/1920-commons`,
  },
  {
    id: "hill-house",
    name: "Hill House",
    kind: "dining-hall",
    operator: "penn-dining",
    address: "3333 Walnut Street, Philadelphia, PA 19104",
    nearBuildings: ["Hill College House"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Food-hall style; weekend brunch. Check Penn Dining for today's hours.",
    menuUrl: PENN_MENUS,
    items: [
      staple("Made-to-order omelet (breakfast and lunch)"),
      staple("Build-your-own pasta at Hill Grill (weekdays)"),
      staple("Global Fusion vegetarian entrée", ["vegetarian"]),
    ],
    sourceUrl: `${PENN_LOC}/residential-dining`,
  },
  {
    id: "lauder-college-house",
    name: "Lauder College House",
    kind: "dining-hall",
    operator: "penn-dining",
    address: "3335 Woodland Walk, Philadelphia, PA 19104",
    nearBuildings: ["Lauder College House"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Dinner-focused, restaurant style; check Penn Dining for hours.",
    menuUrl: PENN_MENUS,
    items: [staple("Chef-curated entrée"), staple("Nightly vegan feature entrée", ["vegan", "vegetarian"])],
    sourceUrl: `${PENN_LOC}/locations/lauder-college-house`,
  },
  {
    id: "english-house",
    name: "Kings Court English House",
    kind: "dining-hall",
    operator: "penn-dining",
    address: "3465 Sansom Street, Philadelphia, PA 19104",
    nearBuildings: ["Kings Court English College House"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Penn Dining's dedicated halal residential café; check Penn Dining for hours.",
    menuUrl: PENN_MENUS,
    items: [],
    sourceUrl: `${PENN_LOC}/residential-dining`,
  },
  {
    id: "quaker-kitchen",
    name: "Quaker Kitchen",
    kind: "dining-hall",
    operator: "penn-dining",
    address: "201 S 40th Street, Philadelphia, PA 19104",
    nearBuildings: ["Gutmann College House"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Dinner only, four nights a week.",
    menuUrl: PENN_MENUS,
    items: [staple("Nightly composed salad"), staple("Nightly entrée")],
    sourceUrl: `${PENN_LOC}/locations/quaker-kitchen`,
  },
  {
    id: "falk-penn-hillel",
    name: "Falk at Penn Hillel",
    kind: "dining-hall",
    operator: "penn-dining",
    address: "215 S 39th Street, Philadelphia, PA 19104",
    nearBuildings: ["Steinhardt Hall (Penn Hillel)", "Harnwell College House"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Penn Dining's kosher café; lunch and dinner on weekdays, Shabbat dinner on Friday. Check Penn Dining for hours.",
    menuUrl: PENN_MENUS,
    // From search results quoting Penn's page (2026-11-18). Penn says the whole
    // menu is Glatt kosher (Community Kashrus of Greater Philadelphia); it
    // names no specific dishes.
    items: [staple("Glatt kosher entrée", ["kosher"])],
    sourceUrl: `${PENN_LOC}/locations/falk-penn-hillel`,
  },
  // ── Penn Dining retail (Dining Dollars; meal exchange uses a swipe) ────────
  {
    id: "houston-market",
    name: "Houston Market",
    kind: "market",
    operator: "penn-dining",
    address: "3417 Spruce Street, Philadelphia, PA 19104",
    nearBuildings: ["Houston Hall"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Weekdays, lower level of Houston Hall; check Penn Dining for hours.",
    menuUrl: PENN_MENUS,
    items: [
      staple("Made-to-order salad"),
      staple("Hand-rolled sushi"),
      staple("Grill favorites"),
      staple("Soup"),
    ],
    sourceUrl: `${PENN_LOC}/retail-dining`,
  },
  {
    id: "1920-gourmet-grocer",
    name: "1920 Gourmet Grocer",
    kind: "market",
    operator: "penn-dining",
    address: "3800 Locust Walk, Philadelphia, PA 19104",
    nearBuildings: ["1920 Commons"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: null,
    menuUrl: PENN_MENUS,
    items: [staple("Rotisserie chicken"), staple("Hot and cold bar"), staple("Sandwiches")],
    sourceUrl: `${PENN_LOC}/retail-dining`,
  },
  {
    id: "joes-cafe",
    name: "Joe's Café",
    kind: "cafe",
    operator: "penn-dining",
    address: "3620 Locust Walk, Philadelphia, PA 19104",
    nearBuildings: ["Steinberg-Dietrich Hall"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Weekdays, breakfast and lunch.",
    menuUrl: PENN_MENUS,
    items: [
      staple("Sushi"),
      staple("Vegetable sushi roll", ["vegan", "vegetarian"]),
      staple("Falafel and hummus bowl"),
      staple("Salad"),
    ],
    sourceUrl: `${PENN_LOC}/locations/joes-cafe`,
  },
  {
    id: "accenture-cafe",
    name: "Accenture Café",
    kind: "cafe",
    operator: "penn-dining",
    address: "220 South 33rd Street, Philadelphia, PA 19104",
    nearBuildings: ["Towne Building"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Weekdays.",
    menuUrl: PENN_MENUS,
    items: [
      staple("La Colombe brewed coffee"),
      staple("Fresh sandwich"),
      staple("Soup"),
      staple("Falafel and hummus bowl"),
      staple("Muffins, scones and pastries"),
    ],
    sourceUrl: `${PENN_LOC}/locations/accenture-cafe`,
  },
  {
    id: "mcclelland-cafe",
    name: "McClelland Café",
    kind: "cafe",
    operator: "penn-dining",
    address: "3700 Spruce Street, Philadelphia, PA 19104",
    nearBuildings: ["Ware College House", "The Quad"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Express spot for a quick meal; check Penn Dining for hours.",
    menuUrl: PENN_MENUS,
    items: [],
    sourceUrl: `${PENN_LOC}/locations/mcclelland-cafe`,
  },
  {
    id: "cafe-west",
    name: "Café West",
    kind: "cafe",
    operator: "penn-dining",
    address: "201 S 40th Street, Philadelphia, PA 19104",
    nearBuildings: ["Gutmann College House"],
    acceptsSwipes: true,
    acceptsDiningDollars: true,
    hoursNote: "Weekday mornings to early afternoon; check Penn Dining for hours.",
    menuUrl: PENN_MENUS,
    // From search results quoting Penn's page (2026-11-18).
    items: [staple("La Colombe coffee"), staple("Tea"), staple("Local pastries")],
    sourceUrl: `${PENN_LOC}/locations/cafe-west`,
  },
  {
    id: "starbucks-1920-commons",
    name: "Starbucks (1920 Commons)",
    kind: "cafe",
    operator: "penn-dining",
    address: "3800 Locust Walk, Philadelphia, PA 19104",
    nearBuildings: ["1920 Commons", "Harnwell College House", "Harrison College House"],
    // Not on Penn's Meal Exchange lists, but no page says swipes are refused.
    acceptsSwipes: null,
    acceptsDiningDollars: true,
    hoursNote: "Downstairs in 1920 Commons; open into the evening most days. Check Penn Dining for hours.",
    menuUrl: "https://www.starbucks.com/menu",
    // From search results quoting Penn's page (2026-11-18). Penn names only
    // "specialty coffees"; this campus store's menu isn't published.
    items: [staple("Starbucks specialty coffee")],
    sourceUrl: `${PENN_LOC}/locations/starbucks`,
  },
  // ── Chains near campus ──────────────────────────────────────────────────────
  {
    id: "pret-huntsman",
    name: "Pret A Manger (Huntsman Hall)",
    kind: "cafe",
    operator: "chain",
    address: "3730 Walnut Street, Philadelphia, PA 19104",
    nearBuildings: ["Jon M. Huntsman Hall"],
    acceptsSwipes: null,
    // Listed by Penn Dining among the retail locations that take Dining Dollars.
    acceptsDiningDollars: true,
    hoursNote: null,
    menuUrl: "https://www.pret.com/en-US",
    // Pret's US product pages; carbs and fat weren't confirmed.
    items: [
      { name: "Chicken Caesar Baguette", calories: 559, proteinG: 26, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Chicken Caesar Half Baguette", calories: 280, proteinG: 13, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Turkey & Cheddar Sandwich", calories: 430, proteinG: 23, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Chicken & Bacon Sandwich", calories: 670, proteinG: 36, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
    ],
    sourceUrl: `${PENN_LOC}/retail-dining`,
  },
  {
    id: "chipotle-3925-walnut",
    name: "Chipotle Mexican Grill",
    kind: "restaurant",
    operator: "chain",
    address: "3925 Walnut Street, Philadelphia, PA 19104",
    nearBuildings: ["The Radian", "Harnwell College House"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: "https://www.chipotle.com/nutrition-calculator",
    // Build-your-own components, per 4 oz serving (tortilla per piece), from
    // Chipotle's March 2025 US nutrition facts; white rice from its 2022 US menu.
    items: [
      { name: "Chicken (4 oz)", calories: 180, proteinG: 32, carbsG: 0, fatG: 7, priceUsd: null, dietary: [] },
      { name: "Steak (4 oz)", calories: 150, proteinG: 21, carbsG: 1, fatG: 6, priceUsd: null, dietary: [] },
      { name: "Sofritas (4 oz)", calories: 150, proteinG: 8, carbsG: 9, fatG: 10, priceUsd: null, dietary: [] },
      { name: "Black beans (4 oz)", calories: 130, proteinG: 8, carbsG: 22, fatG: 1.5, priceUsd: null, dietary: [] },
      { name: "Pinto beans (4 oz)", calories: 130, proteinG: 8, carbsG: 21, fatG: 1.5, priceUsd: null, dietary: [] },
      { name: "Cilantro-lime white rice (4 oz)", calories: 210, proteinG: 4, carbsG: 40, fatG: 4, priceUsd: null, dietary: [] },
      { name: "Flour tortilla (burrito)", calories: 320, proteinG: 8, carbsG: 50, fatG: 9, priceUsd: null, dietary: [] },
    ],
    sourceUrl: "https://www.chipotle.com/content/dam/chipotle/menu/nutrition/US-Nutrition-Facts-Paper-Menu-3-2025.pdf",
  },
  {
    id: "sweetgreen-upenn",
    name: "Sweetgreen (UPenn)",
    kind: "restaurant",
    operator: "chain",
    address: "3925 Walnut Street, Philadelphia, PA 19104",
    nearBuildings: ["The Radian", "Harnwell College House"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: "Usually open daily, late morning to evening.",
    menuUrl: "https://www.sweetgreen.com/menu",
    // Only items whose values agree across Sweetgreen's own menu and nutrition
    // pages; items whose published numbers disagree were left out.
    items: [
      { name: "Kale Caesar", calories: 545, proteinG: 41, carbsG: 18, fatG: 35, priceUsd: null, dietary: [] },
      { name: "Guacamole Greens", calories: 505, proteinG: 27, carbsG: 32, fatG: 30, priceUsd: null, dietary: [] },
      { name: "Super Green Goddess", calories: 465, proteinG: 12, carbsG: 36, fatG: 32, priceUsd: null, dietary: [] },
    ],
    sourceUrl: "https://www.sweetgreen.com/locations/upenn/",
  },
  {
    id: "honeygrow-university-of-penn",
    name: "honeygrow (University of Penn)",
    kind: "restaurant",
    operator: "chain",
    address: "3731 Walnut Street, Philadelphia, PA 19104",
    nearBuildings: ["Jon M. Huntsman Hall", "Annenberg Center"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: "Usually open daily, late morning to evening.",
    menuUrl: "https://www.honeygrow.com/menu/",
    // honeygrow publishes calories on its menu; macros weren't confirmed.
    items: [
      { name: "Sesame Garlic stir-fry", calories: 910, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Spicy Garlic stir-fry", calories: 760, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Vegan Sesame Garlic stir-fry", calories: 680, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: ["vegan", "vegetarian"] },
    ],
    sourceUrl: "https://nutrition.honeygrow.com/",
  },
  {
    id: "starbucks-3401-walnut",
    name: "Starbucks (Shops at Penn)",
    kind: "cafe",
    operator: "chain",
    address: "3401 Walnut Street, Philadelphia, PA 19104",
    nearBuildings: ["Shops at Penn", "Hill College House"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: "https://www.starbucks.com/menu",
    items: [
      { name: "Caffè Latte, grande, 2% milk", calories: 190, proteinG: 13, carbsG: 19, fatG: 7, priceUsd: null, dietary: ["vegetarian"] },
      { name: "Egg White & Roasted Red Pepper Egg Bites", calories: 170, proteinG: 12, carbsG: 11, fatG: 8, priceUsd: null, dietary: [] },
      { name: "Spinach, Feta & Egg White Wrap", calories: 290, proteinG: 20, carbsG: 34, fatG: 8, priceUsd: null, dietary: [] },
      { name: "Turkey Bacon, Cheddar & Egg White Sandwich", calories: 260, proteinG: 17, carbsG: 30, fatG: 9, priceUsd: null, dietary: [] },
    ],
    sourceUrl: "https://www.starbucks.com/menu/product/407/hot/nutrition",
  },
  {
    id: "wawa-3744-spruce",
    name: "Wawa (Spruce Street)",
    kind: "market",
    operator: "chain",
    address: "3744 Spruce Street, Philadelphia, PA 19104",
    nearBuildings: ["The Quad"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: "https://www.wawa.com/nutrition/power-meals",
    // Wawa's nutrition pages list calories, protein and carbs; fat wasn't confirmed.
    // Wawa's pages disagree on the Chicken Steak bowl (280 cal / 28 g protein
    // vs 210 cal / 24 g), so it's marked approximate.
    items: [
      { name: "Oven Roasted Turkey Shorti", calories: 500, proteinG: 35, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Chicken Steak & Egg White Omelet Bowl", calories: 280, proteinG: 28, carbsG: 7, fatG: null, priceUsd: null, dietary: [], approximate: true },
      { name: "Egg White Omelet Bowl", calories: 140, proteinG: 13, carbsG: 3, fatG: null, priceUsd: null, dietary: [] },
      { name: "Southwest Roasted Chicken Salad", calories: 590, proteinG: 45, carbsG: 22, fatG: null, priceUsd: null, dietary: [] },
    ],
    sourceUrl: "https://www.wawa.com/locations/0179",
  },
  {
    id: "shake-shack-3200-chestnut",
    name: "Shake Shack (University City)",
    kind: "restaurant",
    operator: "chain",
    address: "3200 Chestnut Street, Philadelphia, PA 19104",
    nearBuildings: ["Towne Building", "Hill College House"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: "Usually open daily, late morning to late night.",
    menuUrl: "https://shakeshack.com/sites/default/files/2025-04/Master%20Nutrition%203.25%20and%204.1.2025_1.pdf",
    // Shake Shack's April 2025 US nutrition chart, via search results quoting
    // it (2026-11-18); its 2022 chart gives the same numbers.
    items: [
      { name: "Single ShackBurger", calories: 500, proteinG: 29, carbsG: 26, fatG: 30, priceUsd: null, dietary: [] },
      { name: "Double ShackBurger", calories: 760, proteinG: 51, carbsG: 27, fatG: 48, priceUsd: null, dietary: [] },
      { name: "Chicken Shack", calories: 550, proteinG: 33, carbsG: 34, fatG: 31, priceUsd: null, dietary: [] },
    ],
    sourceUrl: "https://shakeshack.com/location/university-city-pa",
  },
  {
    id: "saxbys-4000-locust",
    name: "Saxbys (UPenn)",
    kind: "cafe",
    operator: "chain",
    address: "4000 Locust Street, Philadelphia, PA 19104",
    nearBuildings: ["Gutmann College House", "Harnwell College House"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: "Weekdays, morning to afternoon.",
    menuUrl: "https://www.saxbyscoffee.com/menu/",
    // Saxbys' menu, via search results quoting it (2026-11-18): calories and
    // protein only; sizes other than the Chai's 16 oz aren't stated.
    items: [
      { name: "Cold Brew Fit Frolatte", calories: 240, proteinG: 22, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Matcha Fit Frolatte", calories: 280, proteinG: 22, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Chai Fit Frolatte (16 oz)", calories: 340, proteinG: 22, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
    ],
    sourceUrl: "https://www.saxbyscoffee.com/location/saxbys-university-of-pennsylvania",
  },
  {
    id: "wawa-3604-chestnut",
    name: "Wawa (Chestnut Street)",
    kind: "market",
    operator: "chain",
    address: "3604 Chestnut Street, Philadelphia, PA 19104",
    nearBuildings: ["Penn Bookstore", "Annenberg School for Communication"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: "https://www.wawa.com/nutrition/calorie-conscious",
    // Wawa's nutrition pages, via search results quoting them (2026-11-18);
    // fat wasn't found, nor the Shorti's carbs.
    items: [
      { name: "Oven Roasted Turkey Shorti", calories: 500, proteinG: 35, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Egg White Omelet Bowl", calories: 140, proteinG: 13, carbsG: 3, fatG: null, priceUsd: null, dietary: [] },
    ],
    sourceUrl: "https://www.wawa.com/locations/0055",
  },
  {
    id: "panera-200-s-40th",
    name: "Panera Bread (40th & Walnut)",
    kind: "restaurant",
    operator: "chain",
    address: "200 South 40th Street, Philadelphia, PA 19104",
    nearBuildings: ["The Radian", "Harnwell College House"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: "https://www.panerabread.com/en-us/menu/nutritious-eating/allergen-and-nutrition-information.html",
    // Soup from Panera's nutrition guide effective 9/2/2026. The Bravo is from the
    // 6/17/2026 guide, read from a garbled table, so it's marked approximate. Frontega
    // calories are from Panera's Winter 2026 catering menu. The Mediterranean Bowl is
    // from Panera's Winter 2023 menu, the latest official figure found.
    items: [
      { name: "Broccoli Cheddar Soup, cup", calories: 280, proteinG: 8, carbsG: 17, fatG: 20, priceUsd: null, dietary: ["vegetarian"] },
      { name: "Bacon Turkey Bravo Sandwich, half", calories: 430, proteinG: 24, carbsG: null, fatG: null, priceUsd: null, dietary: [], approximate: true },
      { name: "Toasted Frontega Chicken Sandwich, whole", calories: 860, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Mediterranean Bowl with Chicken", calories: 570, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: [], approximate: true },
    ],
    sourceUrl: "https://www.panerabread.com/content/dam/panerabread/documents/c8-26-nutrition-guide.pdf",
  },
  {
    id: "qdoba-230-s-40th",
    name: "QDOBA Mexican Eats (40th & Locust)",
    kind: "restaurant",
    operator: "chain",
    address: "230 South 40th Street, #140, Philadelphia, PA 19104",
    nearBuildings: ["Harnwell College House", "Harrison College House"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: "https://www.qdoba.com/nutrition-allergens",
    // Build-your-own components from QDOBA's own nutrition PDF, which is labelled
    // 2020 and whose column headers were read by inference, so all approximate.
    items: [
      { name: "Grilled adobo chicken (3.5 oz)", calories: 150, proteinG: 16, carbsG: 2, fatG: 9, priceUsd: null, dietary: [], approximate: true },
      { name: "Cilantro lime rice (4 oz)", calories: 190, proteinG: 3, carbsG: 38, fatG: 3, priceUsd: null, dietary: ["vegetarian"], approximate: true },
      { name: "Black beans (4 oz)", calories: 140, proteinG: 9, carbsG: 24, fatG: 1, priceUsd: null, dietary: ["vegetarian"], approximate: true },
    ],
    sourceUrl: "https://locations.qdoba.com/pa/philadelphia/230-s-40th-st/tacos",
  },
  {
    id: "playa-bowls-4034-walnut",
    name: "Playa Bowls (Walnut Street)",
    kind: "cafe",
    operator: "chain",
    // The DP's 2023 opening story says 4034; a later DP article says 4043.
    address: "4034 Walnut Street, Philadelphia, PA 19104",
    nearBuildings: ["The Radian"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: null,
    // Playa Bowls' nutrition widget (EveryBite) for the Nutella Bowl; the others from
    // third-party trackers (FatSecret), whose figures vary by source, so all approximate.
    items: [
      { name: "Nutella Bowl (açaí)", calories: 780, proteinG: 11, carbsG: 119, fatG: 30, priceUsd: null, dietary: ["vegetarian"], approximate: true },
      { name: "Power Bowl", calories: 850, proteinG: 28, carbsG: 116, fatG: 32, priceUsd: null, dietary: ["vegetarian"], approximate: true },
      { name: "Tropical Playa Bowl (açaí)", calories: 610, proteinG: 8, carbsG: 101, fatG: 20, priceUsd: null, dietary: ["vegetarian"], approximate: true },
      { name: "Dragonberry Bowl (pitaya)", calories: 620, proteinG: 5, carbsG: 134, fatG: 8, priceUsd: null, dietary: ["vegetarian"], approximate: true },
    ],
    sourceUrl: "https://www.thedp.com/article/2023/03/penn-new-playa-bowls-and-gong-cha",
  },
  {
    id: "dunkin-3437-walnut",
    name: "Dunkin' (Walnut Street)",
    kind: "cafe",
    operator: "chain",
    // Address from directory listings; Dunkin's own locator wasn't readable.
    address: "3437 Walnut Street, Philadelphia, PA 19104",
    nearBuildings: ["Shops at Penn"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: "Takeout only; no seating.",
    menuUrl: "https://www.dunkindonuts.com/menu/categories/sandwiches-wraps/",
    // Sausage, Egg & Cheese calories from Dunkin's menu page. Dunkin's site showed no
    // other numbers, so the rest are from third-party trackers (FatSecret, Eat This)
    // and marked approximate.
    items: [
      { name: "Sausage, Egg & Cheese", calories: 640, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Turkey Sausage, Egg & Cheese", calories: 470, proteinG: 23, carbsG: null, fatG: 25, priceUsd: null, dietary: [], approximate: true },
      { name: "Egg & Cheese Wake-Up Wrap", calories: 180, proteinG: 7, carbsG: 14, fatG: 10, priceUsd: null, dietary: ["vegetarian"], approximate: true },
      { name: "Avocado Toast", calories: 250, proteinG: 7, carbsG: null, fatG: null, priceUsd: null, dietary: ["vegetarian"], approximate: true },
    ],
    sourceUrl: "https://www.dunkindonuts.com/menu/categories/sandwiches-wraps/",
  },
  {
    id: "dig-university-city",
    name: "Dig Inn (University City)",
    kind: "restaurant",
    operator: "chain",
    address: "140 South 36th Street, Philadelphia, PA 19104",
    nearBuildings: ["Annenberg Center"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: null,
    // Chicken from Dig Inn's nutrition PDF of March 3, 2026; sides from its PDF of
    // September 10, 2026, which changed several values and couldn't be read in full,
    // so all are marked approximate.
    items: [
      { name: "Charred Chicken (4.3 oz)", calories: 230, proteinG: 28, carbsG: 1, fatG: 12, priceUsd: null, dietary: [], approximate: true },
      { name: "Roasted Sweet Potatoes", calories: 310, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: ["vegetarian"], approximate: true },
      { name: "Charred Broccoli with Lemon", calories: 130, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: ["vegetarian"], approximate: true },
    ],
    sourceUrl: "https://www.diginn.com/locations/pa/philadelphia/140-s-36th-street/",
  },
  {
    id: "pho-cafe-saigon",
    name: "Pho & Cafe Saigon",
    kind: "restaurant",
    operator: "independent",
    address: "4248 Spruce Street, Philadelphia, PA 19104",
    nearBuildings: ["Penn Alexander School"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: null,
    // No published nutrition. Pho scaled from USDA FoodData Central "Soup, pho, with
    // meat" (FDC 2707124: per 100 g, 77 kcal, 5.8 g protein, ~6 g carbs, ~3 g fat) to
    // a ~600 g regular and ~850 g large bowl. Bánh mì is a rough estimate (baguette,
    // ~3 oz grilled pork, pickled vegetables, mayo). All approximate.
    items: [
      { name: "Beef pho, regular bowl", calories: 460, proteinG: 35, carbsG: 38, fatG: 20, priceUsd: null, dietary: [], approximate: true },
      { name: "Beef pho, large bowl", calories: 655, proteinG: 49, carbsG: 54, fatG: 28, priceUsd: null, dietary: [], approximate: true },
      { name: "Grilled pork bánh mì", calories: 550, proteinG: 27, carbsG: 62, fatG: 21, priceUsd: null, dietary: [], approximate: true },
    ],
    sourceUrl: "https://www.yelp.com/biz/pho-and-cafe-saigon-philadelphia",
  },
  // ── Rittenhouse and Center City (a 25–30 minute walk, or the 21/42 bus) ─────
  {
    id: "dig-rittenhouse",
    name: "Dig Inn (Rittenhouse)",
    kind: "restaurant",
    operator: "chain",
    address: "1616 Chestnut Street, Philadelphia, PA 19103",
    nearBuildings: ["Rittenhouse Square"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: "Usually 11 a.m. to 10 p.m., closing earlier on Sundays.",
    menuUrl: null,
    // Same sources as Dig Inn (University City): chicken from the March 3, 2026 PDF,
    // sides from the September 10, 2026 PDF; all approximate.
    items: [
      { name: "Charred Chicken (4.3 oz)", calories: 230, proteinG: 28, carbsG: 1, fatG: 12, priceUsd: null, dietary: [], approximate: true },
      { name: "Roasted Sweet Potatoes", calories: 310, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: ["vegetarian"], approximate: true },
      { name: "Charred Broccoli with Lemon", calories: 130, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: ["vegetarian"], approximate: true },
    ],
    sourceUrl: "https://www.diginn.com/locations/pa/philadelphia/1616-chestnut-street/",
  },
  {
    id: "pho-mi-rittenhouse",
    name: "Pho Mi Rittenhouse",
    kind: "restaurant",
    operator: "independent",
    address: "106 South 20th Street, Philadelphia, PA 19103",
    nearBuildings: ["Rittenhouse Square"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: null,
    // No published nutrition; same basis as Pho & Cafe Saigon (USDA FDC 2707124
    // scaled to a ~600 g / ~850 g bowl; bánh mì a rough estimate). All approximate.
    items: [
      { name: "Beef pho, regular bowl", calories: 460, proteinG: 35, carbsG: 38, fatG: 20, priceUsd: null, dietary: [], approximate: true },
      { name: "Beef pho, large bowl", calories: 655, proteinG: 49, carbsG: 54, fatG: 28, priceUsd: null, dietary: [], approximate: true },
      { name: "Grilled pork bánh mì", calories: 550, proteinG: 27, carbsG: 62, fatG: 21, priceUsd: null, dietary: [], approximate: true },
    ],
    sourceUrl: "https://www.ubereats.com/store/pho-mi-rittenhouse-s-20th-st/jDRXgIDTTHW03BdP4o06OA/19e31c7b-d393-4932-9bc8-211f512b29e7/606e457d-8f32-5a6f-9649-5be632ab5f8c",
  },
  {
    id: "cava-rittenhouse",
    name: "CAVA (Rittenhouse)",
    kind: "restaurant",
    operator: "chain",
    address: "1713 Chestnut Street, Philadelphia, PA 19103",
    nearBuildings: ["Rittenhouse Square"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: null,
    // Build-your-own components as quoted from CAVA's nutrition and allergen guide
    // (Q1 2025) by third-party sites; the guide itself couldn't be read, so all are
    // approximate.
    items: [
      { name: "Grilled Chicken", calories: 250, proteinG: 28, carbsG: 2, fatG: 13, priceUsd: null, dietary: [], approximate: true },
      { name: "Harissa Honey Chicken", calories: 260, proteinG: 26, carbsG: 7, fatG: 14, priceUsd: null, dietary: [], approximate: true },
      { name: "Saffron Basmati Rice", calories: 290, proteinG: 5, carbsG: 54, fatG: 7, priceUsd: null, dietary: ["vegetarian"], approximate: true },
      { name: "Hummus", calories: 50, proteinG: 2, carbsG: 4, fatG: 2.5, priceUsd: null, dietary: ["vegetarian"], approximate: true },
    ],
    sourceUrl: "https://assets.ctfassets.net/kugm9fp9ib18/20WmUiLdcxokvsfq8IbyFa/5e9d6325a46f5c031d51165da83a01f5/CAVA_Q125_REGULAR_NUTRITION_ALLERGEN.pdf",
  },
  {
    id: "sweetgreen-rittenhouse",
    name: "Sweetgreen (Rittenhouse)",
    kind: "restaurant",
    operator: "chain",
    address: "1821 Chestnut Street, Philadelphia, PA 19103",
    nearBuildings: ["Rittenhouse Square"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: "https://www.sweetgreen.com/menu",
    // Sweetgreen's menu and nutrition pages. Kale Caesar agrees across them; the
    // others differ between pages, so the location-page figures are used and marked
    // approximate.
    items: [
      { name: "Kale Caesar", calories: 545, proteinG: 41, carbsG: 18, fatG: 35, priceUsd: null, dietary: [] },
      { name: "Chicken Pesto Parm", calories: 510, proteinG: 38, carbsG: 30, fatG: 24, priceUsd: null, dietary: [], approximate: true },
      { name: "Harvest Bowl", calories: 760, proteinG: 40, carbsG: 60, fatG: 42, priceUsd: null, dietary: [], approximate: true },
    ],
    sourceUrl: "https://www.sweetgreen.com/nutrition/",
  },
  {
    id: "honeygrow-16th-street",
    name: "honeygrow (16th Street)",
    kind: "restaurant",
    operator: "chain",
    address: "110 South 16th Street, Philadelphia, PA 19102",
    nearBuildings: ["Rittenhouse Square"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: "Usually open daily, 10:30 a.m. to 10 p.m.",
    menuUrl: "https://www.honeygrow.com/menu/",
    // honeygrow publishes calories on its menu; macros weren't confirmed.
    items: [
      { name: "Sesame Garlic stir-fry", calories: 910, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Spicy Garlic stir-fry", calories: 760, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: [] },
      { name: "Vegan Sesame Garlic stir-fry", calories: 680, proteinG: null, carbsG: null, fatG: null, priceUsd: null, dietary: ["vegan", "vegetarian"] },
    ],
    sourceUrl: "https://www.honeygrow.com/location/16th-street/",
  },
  {
    id: "chipotle-1512-walnut",
    name: "Chipotle Mexican Grill (Rittenhouse Square)",
    kind: "restaurant",
    operator: "chain",
    address: "1512 Walnut Street, Philadelphia, PA 19102",
    nearBuildings: ["Rittenhouse Square"],
    acceptsSwipes: false,
    acceptsDiningDollars: false,
    hoursNote: null,
    menuUrl: "https://www.chipotle.com/nutrition-calculator",
    // Build-your-own components, per 4 oz serving (tortilla per piece), from
    // Chipotle's March 2025 US nutrition facts; white rice from its 2022 US menu.
    items: [
      { name: "Chicken (4 oz)", calories: 180, proteinG: 32, carbsG: 0, fatG: 7, priceUsd: null, dietary: [] },
      { name: "Steak (4 oz)", calories: 150, proteinG: 21, carbsG: 1, fatG: 6, priceUsd: null, dietary: [] },
      { name: "Sofritas (4 oz)", calories: 150, proteinG: 8, carbsG: 9, fatG: 10, priceUsd: null, dietary: [] },
      { name: "Black beans (4 oz)", calories: 130, proteinG: 8, carbsG: 22, fatG: 1.5, priceUsd: null, dietary: [] },
      { name: "Cilantro-lime white rice (4 oz)", calories: 210, proteinG: 4, carbsG: 40, fatG: 4, priceUsd: null, dietary: [] },
    ],
    sourceUrl: "https://locations.chipotle.com/pa/philadelphia",
  },
];
