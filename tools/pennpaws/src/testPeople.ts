// Fake Penn students for testing PennPaws locally, where the platform signs
// everyone in as the same test user. Their ids start with "seed-", so they
// never mix with real members and can be removed in one go. Used by
// scripts/seed.mjs and by the test menu that shows only under `pnpm dev`
// (apps/web/src/app/tools/pennpaws/TestMenu.tsx); never on the live site.
//
// playTestPeople stands in for the person on the other side: fake sitters
// offer on your open requests (the two who fit best), fake owners pick the
// first sitter who offered on theirs, and anyone fake approves an agreement
// waiting on them.
//
// Some requests are written the way students really post, in Chinese or with
// preferences tucked into the notes, so "Rank with AI" has something the
// rules can't read.

import type { Sql } from "postgres";
import { agreementTemplate } from "./agreement.js";
import { matchRequests } from "./match.js";
import { checkProfile, type SitterProfile } from "./profile.js";
import { checkDraft, type Checked } from "./request.js";
import { saveMember } from "./members.js";
import { acceptOffer, approveAgreement, createRequest, listOpenRequests, offerHelp, type Person } from "./requests.js";

export const TEST_ID_PREFIX = "seed-";

// ── Dates ────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromToday = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
};
/** The coming Saturday, `weeks` weeks out. */
const saturday = (weeks = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + weeks * 7);
  return d;
};
const plusDays = (d: Date, days: number) => {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return iso(next);
};
/** Thanksgiving week this year, or a month out once it has passed. */
const thanksgiving = (() => {
  const year = new Date().getFullYear();
  const nov1 = new Date(year, 10, 1);
  const thursday = new Date(year, 10, 1 + ((4 - nov1.getDay() + 7) % 7) + 21);
  return thursday > new Date() ? thursday : new Date(Date.now() + 30 * 86_400_000);
})();

// ── People ───────────────────────────────────────────────────────────────────

const near = (area: string, lat: number, lng: number) => ({ area, lat, lng });

// Profiles and requests are checked with checkProfile and checkDraft before saving, so a typo fails loudly.
const SITTERS: { id: string; name: string; profile: unknown }[] = [
  {
    id: "seed-sitter-maya",
    name: "Maya Chen",
    profile: {
      role: "sitter",
      location: near("University City", 39.952, -75.194),
      services: ["walk", "drop_in", "overnight"],
      petKinds: ["dogs", "cats"],
      sizes: ["small", "medium", "large"],
      energy: ["low", "medium", "high"],
      anxiousOk: true,
      experience: ["owned_dogs", "owned_cats", "medication"],
      travel: "1",
      availability: ["weekday_evenings", "weekends", "breaks"],
      gender: "woman",
      showGender: true,
      bio: "Second-year nursing student. Grew up with a golden retriever and two cats, and I'm on campus over Thanksgiving.",
      languages: ["english", "spanish"],
      boarding: null,
    },
  },
  {
    id: "seed-sitter-jordan",
    name: "Jordan Park",
    profile: {
      role: "sitter",
      location: near("Rittenhouse", 39.949, -75.172),
      services: ["walk"],
      petKinds: ["dogs"],
      sizes: ["medium", "large", "giant"],
      energy: ["medium", "high"],
      anxiousOk: false,
      experience: ["owned_dogs"],
      travel: "2",
      availability: ["weekday_mornings", "weekends"],
      gender: "man",
      showGender: true,
      bio: "Wharton MBA and marathoner. Happy to take big, energetic dogs on long runs along the Schuylkill.",
      languages: ["english"],
      boarding: null,
    },
  },
  {
    id: "seed-sitter-wen",
    name: "Wen Li",
    profile: {
      role: "sitter",
      location: near("Spruce Hill", 39.951, -75.209),
      services: ["drop_in", "overnight"],
      petKinds: ["cats", "small_pets"],
      sizes: ["small"],
      energy: ["low", "medium"],
      anxiousOk: true,
      experience: ["owned_cats", "injections", "seniors", "medication"],
      travel: "1",
      availability: ["weekday_daytime", "weekday_evenings", "breaks"],
      gender: "woman",
      showGender: true,
      bio: "Senior, with two cats of my own at home. Vet school applicant; I've given insulin shots to my own diabetic cat for two years.",
      languages: ["mandarin", "english"],
      boarding: null,
    },
  },
  {
    id: "seed-sitter-sam",
    name: "Sam Rivera",
    profile: {
      role: "sitter",
      location: near("Fishtown", 39.972, -75.134),
      services: ["drop_in", "boarding"],
      petKinds: ["dogs", "cats"],
      sizes: ["small", "medium"],
      energy: ["low", "medium"],
      anxiousOk: false,
      experience: ["owned_dogs", "puppies"],
      travel: "5",
      availability: ["weekends", "breaks"],
      gender: "non_binary",
      showGender: false,
      bio: "Engineering PhD with a small fenced yard. I can board small dogs at my place on weekends.",
      languages: ["english", "korean"],
      boarding: { homeType: "house", homeTypeOther: null, hasYard: true, otherPets: "One calm senior beagle", housingAllowsPets: true, roommatesAgree: true },
    },
  },
];

const pet = (fields: Record<string, unknown>) => ({
  kindOther: null,
  withAnimals: "unknown",
  specialCare: [],
  specialCareOther: null,
  bites: false,
  bitesDetails: null,
  ...fields,
});

const request = (fields: Record<string, unknown>) => ({
  petKindOther: null,
  petDetails: null,
  photo: null,
  weekly: false,
  frequencyOther: null,
  tasksOther: null,
  accessOther: null,
  vet: null,
  notes: null,
  ...fields,
});

const OWNERS: { id: string; name: string; profile: unknown; request: unknown }[] = [
  {
    id: "seed-owner-hana",
    name: "Hana Zhou",
    profile: {
      role: "owner",
      location: near("Rittenhouse", 39.948, -75.175),
      pet: pet({ name: "Tofu", kind: "cat", size: "small", age: "adult", energy: "low", withPeople: "warms_up", alone: "fine" }),
      sitterGenderPref: "none",
    },
    request: request({
      petName: "Tofu",
      petKind: "cat",
      petDetails: "Golden shaded British Shorthair, neutered boy, 3 years",
      startsOn: iso(new Date(thanksgiving.getTime() - 3 * 86_400_000)),
      endsOn: iso(new Date(thanksgiving.getTime() + 4 * 86_400_000)),
      frequency: "once_daily",
      tasks: ["feeding", "water", "litter", "playtime"],
      access: "in_person",
      pay: "$25 a visit",
      area: "Rittenhouse",
      notes: "Home for Thanksgiving week. Looking for a reliable student with cat experience to drop in once a day and feed him. A photo or short video each day would mean a lot. I'd prefer a woman sitter, thank you!",
      mustHaves: ["cat_experience", "daily_updates"],
      sitterGender: "woman",
    }),
  },
  {
    id: "seed-owner-ben",
    name: "Ben Okafor",
    profile: {
      role: "owner",
      location: near("University City", 39.951, -75.201),
      pet: pet({ name: "Maple", kind: "dog", size: "large", age: "adult", energy: "high", withPeople: "loves_everyone", withAnimals: "friendly", alone: "fine" }),
      sitterGenderPref: "none",
    },
    request: request({
      petName: "Maple",
      petKind: "dog",
      petDetails: "Yellow lab, 4 years",
      startsOn: iso(saturday()),
      endsOn: plusDays(saturday(), 1),
      frequency: "twice_daily",
      tasks: ["walks", "feeding", "water"],
      access: "front_desk",
      pay: "$20 a walk",
      area: "University City, 40th and Pine",
      notes: "Away for a wedding. She pulls hard at first, then settles. Loves Clark Park.",
    }),
  },
  {
    id: "seed-owner-yu",
    name: "Zhang Yu",
    profile: {
      role: "owner",
      location: near("Spruce Hill", 39.95, -75.212),
      pet: pet({ name: "Doudou", kind: "cat", size: "small", age: "senior", energy: "low", withPeople: "shy", alone: "fine", specialCare: ["injections", "senior_care"] }),
      sitterGenderPref: "none",
    },
    request: request({
      petName: "Doudou",
      petKind: "cat",
      petDetails: "Dragon Li, 14 years old",
      startsOn: fromToday(18),
      endsOn: fromToday(27),
      frequency: "twice_daily",
      tasks: ["feeding", "medication", "litter"],
      access: "lockbox",
      pay: "$30 a visit",
      area: "Spruce Hill, 45th and Baltimore",
      vet: "Penn Vet Ryan Hospital",
      notes: "Doudou is diabetic and needs an insulin shot at 8am and 8pm every day, so I need someone who has given injections before. She's shy with strangers and will hide under the bed the first time you meet, then she settles.",
      languages: ["mandarin"],
    }),
  },
  {
    id: "seed-owner-priya",
    name: "Priya Shah",
    profile: {
      role: "owner",
      location: near("Graduate Hospital", 39.943, -75.178),
      pet: pet({ name: "Pickles", kind: "dog", size: "small", age: "young", energy: "high", withPeople: "loves_everyone", withAnimals: "selective", alone: "separation_anxiety" }),
      sitterGenderPref: "none",
    },
    request: request({
      petName: "Pickles",
      petKind: "dog",
      petDetails: "Corgi mix puppy, 9 months",
      weekly: true,
      startsOn: null,
      endsOn: null,
      frequency: "other",
      frequencyOther: "Tuesday and Thursday evenings",
      tasks: ["walks", "playtime"],
      access: "in_person",
      pay: "$18 a walk",
      area: "Graduate Hospital",
      notes: "I have late classes Tue and Thu. He gets anxious when left alone, so a long walk and some play really helps.",
    }),
  },
  {
    id: "seed-owner-leo",
    name: "Leo Martin",
    profile: {
      role: "owner",
      location: near("Powelton Village", 39.961, -75.196),
      pet: pet({ name: "Kiwi and Mango", kind: "other", kindOther: "Two parakeets", size: "small", age: "adult", energy: "medium", withPeople: "warms_up", alone: "fine" }),
      sitterGenderPref: "none",
    },
    request: request({
      petName: "Kiwi and Mango",
      petKind: "other",
      petKindOther: "Two parakeets",
      startsOn: iso(saturday(1)),
      endsOn: plusDays(saturday(1), 2),
      frequency: "once_daily",
      tasks: ["feeding", "water", "other"],
      tasksOther: "Cover the cage at night",
      access: "decide_later",
      pay: "$15 a visit",
      area: "Powelton Village",
    }),
  },
  {
    id: "seed-owner-chloe",
    name: "Chloe Wang",
    profile: {
      role: "owner",
      location: near("Center City", 39.952, -75.163),
      pet: pet({
        name: "Ghost",
        kind: "dog",
        size: "large",
        age: "adult",
        energy: "high",
        withPeople: "warms_up",
        withAnimals: "not_good",
        alone: "bit_anxious",
        bites: true,
        bitesDetails: "Nipped a delivery person through the door once. Fine once he knows you.",
      }),
      sitterGenderPref: "none",
    },
    request: request({
      petName: "Ghost",
      petKind: "dog",
      petDetails: "Husky, 5 years",
      startsOn: iso(saturday(2)),
      endsOn: plusDays(saturday(2), 2),
      careType: "stay",
      frequency: "overnight",
      tasks: ["walks", "feeding", "water"],
      access: "in_person",
      pay: "$60 a night",
      area: "Center City, near 15th and Locust",
      notes: "Would love someone who has had big dogs before. Keep him away from other dogs on walks. Meet and greet first please.",
    }),
  },
];

const person = (p: { id: string; name: string }): Person => ({ id: p.id, name: p.name, email: `${p.id.replace("seed-", "")}@seed.local` });

const MESSAGES: Record<string, string> = {
  "seed-sitter-maya": "Hi! I'm Maya, a nursing student near 40th St. I've had dogs and cats all my life and I'm around that week. Happy to send photos every day.",
  "seed-sitter-jordan": "Hey, Jordan here. I run most mornings and would love the company. Big dogs welcome.",
  "seed-sitter-wen": "Hi! I'm Wen, I live nearby and have looked after cats for years, including insulin shots. Would love to help.",
  "seed-sitter-sam": "Hi, I'm Sam. I have a fenced yard and a calm senior beagle, and I'm free most weekends.",
};

// ── Actions ──────────────────────────────────────────────────────────────────

function must<T>(checked: Checked<T>, what: string): T {
  if (!checked.ok) throw new Error(`${what}: ${checked.error}`);
  return checked.value;
}

/** Removes every fake person, their requests and anything tied to them. */
export async function removeTestPeople(sql: Sql): Promise<void> {
  await sql`DELETE FROM requests WHERE owner_id LIKE 'seed-%'`;
  await sql`DELETE FROM offers WHERE sitter_id LIKE 'seed-%'`;
  await sql`DELETE FROM threads WHERE sitter_id LIKE 'seed-%'`;
  await sql`DELETE FROM notifications WHERE user_id LIKE 'seed-%'`;
  await sql`DELETE FROM members WHERE user_id LIKE 'seed-%'`;
}

/** Adds the fake sitters and owners with their open requests, replacing any earlier ones. */
export async function seedTestPeople(sql: Sql): Promise<{ sitters: number; owners: number }> {
  await removeTestPeople(sql);
  for (const s of SITTERS) await saveMember(sql, person(s), "upenn.edu", must(checkProfile(s.profile), s.name));
  for (const o of OWNERS) {
    await saveMember(sql, person(o), "upenn.edu", must(checkProfile(o.profile), o.name));
    await createRequest(sql, person(o), must(checkDraft(o.request), `${o.name}'s request`));
  }
  return { sitters: SITTERS.length, owners: OWNERS.length };
}

/**
 * Wipes one member's PennPaws data: their setup, requests, offers, messages,
 * payments, ratings and notifications. Their next visit starts at first-time
 * setup, as a new member would.
 */
export async function forgetMember(sql: Sql, userId: string): Promise<void> {
  await sql.begin(async (transaction) => {
    // postgres.js types drop the call signature from TransactionSql, though it has one.
    const tx = transaction as unknown as Sql;
    await tx`DELETE FROM requests WHERE owner_id = ${userId}`;
    await tx`DELETE FROM agreements WHERE offer_id IN (SELECT id FROM offers WHERE sitter_id = ${userId})`;
    // Requests they were the sitter on go back to open, so the owner (usually a fake one) can pick again.
    await tx`
      UPDATE requests SET status = 'open', completed_at = NULL, updated_at = NOW()
      WHERE status IN ('matched', 'agreed', 'completed')
        AND id IN (SELECT request_id FROM offers WHERE sitter_id = ${userId} AND status = 'accepted')
    `;
    await tx`DELETE FROM offers WHERE sitter_id = ${userId}`;
    await tx`DELETE FROM threads WHERE sitter_id = ${userId}`;
    await tx`DELETE FROM payments WHERE sitter_id = ${userId}`;
    await tx`DELETE FROM reviews WHERE sitter_id = ${userId} OR owner_id = ${userId}`;
    await tx`DELETE FROM notifications WHERE user_id = ${userId}`;
    await tx`DELETE FROM members WHERE user_id = ${userId}`;
  });
}

/** Has the fake people take their next step, and says what each did. */
export async function playTestPeople(sql: Sql): Promise<string[]> {
  const done: string[] = [];

  // Fake sitters offer on real people's open requests: the two who fit best.
  const realIds = new Set(
    (await sql<{ id: string }[]>`SELECT id FROM requests WHERE status = 'open' AND owner_id NOT LIKE 'seed-%'`).map((r) => r.id),
  );
  const real = (await listOpenRequests(sql, `${TEST_ID_PREFIX}viewer`)).filter((r) => realIds.has(r.id));
  const sitters = SITTERS.map((s) => ({ ...s, profile: must(checkProfile(s.profile), s.name) as SitterProfile }));
  const scores = new Map<string, { sitter: (typeof sitters)[number]; score: number }[]>();
  for (const sitter of sitters) {
    for (const m of await matchRequests(sql, sitter.profile, real)) {
      scores.set(m.requestId, [...(scores.get(m.requestId) ?? []), { sitter, score: m.score }]);
    }
  }
  for (const request of real) {
    const best = (scores.get(request.id) ?? []).sort((a, b) => b.score - a.score).slice(0, 2);
    for (const { sitter } of best) {
      const [already] = await sql`SELECT 1 FROM offers WHERE request_id = ${request.id} AND sitter_id = ${sitter.id}`;
      if (already) continue;
      await offerHelp(sql, person(sitter), request.id, MESSAGES[sitter.id] ?? "I'd love to help.");
      done.push(`${sitter.name} offered to help with ${request.draft.petName}.`);
    }
  }

  // Fake owners pick the first sitter who offered.
  const offers = await sql<{ owner_id: string; pet_name: string; offer_id: string }[]>`
    SELECT DISTINCT ON (r.id) r.owner_id, r.pet_name, o.id AS offer_id
    FROM requests r JOIN offers o ON o.request_id = r.id AND o.status = 'pending'
    WHERE r.status = 'open' AND r.owner_id LIKE 'seed-%'
    ORDER BY r.id, o.created_at
  `;
  for (const o of offers) {
    await acceptOffer(sql, o.owner_id, o.offer_id, async (draft, ownerFirstName) => agreementTemplate(draft, ownerFirstName));
    done.push(`The owner of ${o.pet_name} picked a sitter, and the agreement is ready.`);
  }

  // Fake people approve agreements waiting on them.
  const waiting = await sql<{ request_id: string; version: number; pet_name: string; boarding: boolean; owner_id: string | null; sitter_id: string | null }[]>`
    SELECT a.request_id, a.version, r.pet_name, r.care_type = 'boarding' AS boarding,
           CASE WHEN r.owner_id LIKE 'seed-%' AND a.owner_approved_at IS NULL THEN r.owner_id END AS owner_id,
           CASE WHEN o.sitter_id LIKE 'seed-%' AND a.sitter_approved_at IS NULL THEN o.sitter_id END AS sitter_id
    FROM agreements a JOIN requests r ON r.id = a.request_id JOIN offers o ON o.id = a.offer_id
    WHERE r.status = 'matched'
  `;
  for (const w of waiting) {
    for (const userId of [w.owner_id, w.sitter_id]) {
      if (!userId) continue;
      const hostsCare = w.boarding === (userId === w.sitter_id);
      await approveAgreement(sql, userId, w.request_id, w.version, { phone: "215-555-0100", address: hostsCare ? "3900 Spruce St, Apt 2B (fake)" : null });
      done.push(`${userId.startsWith("seed-owner") ? "The owner" : "The sitter"} approved the agreement for ${w.pet_name}.`);
    }
  }
  return done;
}
