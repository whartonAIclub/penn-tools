// Fake Penn students for testing PennPaws locally, where the platform signs
// everyone in as the same test user. Their ids start with "seed-", so they
// never mix with real members and can be removed in one go.
//
//   pnpm --filter @penntools/tool-pennpaws seed          add them (replacing any earlier ones)
//   pnpm --filter @penntools/tool-pennpaws seed play     have them take their next step
//   pnpm --filter @penntools/tool-pennpaws seed reset    remove them
//
// "play" stands in for the person on the other side. Fake sitters offer on
// your open requests (the two who fit best), fake owners pick the first sitter
// who offered on theirs, and anyone fake approves an agreement waiting on
// them. Run it after each step you take as yourself.
//
// Some requests are written the way students really post, in Chinese or with
// preferences tucked into the notes, so "Rank with AI" has something the
// rules can't read.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  acceptOffer,
  agreementTemplate,
  approveAgreement,
  checkDraft,
  checkProfile,
  createRequest,
  offerHelp,
  pointOf,
  saveMember,
  scoreMatch,
} from "../dist/index.js";

const envFile = fileURLToPath(new URL("../../../apps/web/.env.local", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL, or create apps/web/.env.local (see the README).");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { connection: { search_path: "pennpaws" }, onnotice: () => {} });

// ── Dates ────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromToday = (days) => {
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
const plusDays = (d, days) => {
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

const near = (area, lat, lng) => ({ area, lat, lng });

const SITTERS = [
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
      bio: "大四学生，家里有两只猫。Vet school applicant; I've given insulin shots to my own diabetic cat for two years.",
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

const pet = (fields) => ({
  kindOther: null,
  withAnimals: "unknown",
  specialCare: [],
  specialCareOther: null,
  bites: false,
  bitesDetails: null,
  ...fields,
});

const request = (fields) => ({
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

const OWNERS = [
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
      petDetails: "金渐层, neutered boy, 3 years",
      startsOn: iso(new Date(thanksgiving.getTime() - 3 * 86_400_000)),
      endsOn: iso(new Date(thanksgiving.getTime() + 4 * 86_400_000)),
      frequency: "once_daily",
      tasks: ["feeding", "water", "litter", "playtime"],
      access: "in_person",
      pay: "$25 a visit",
      area: "Rittenhouse",
      notes: "感恩节回家一周，想找有养猫经验、靠谱的同学每天上门喂一次。希望每天发张照片或小视频报平安。女生优先，谢谢！",
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
      petDetails: "14 岁的狸花猫",
      startsOn: fromToday(18),
      endsOn: fromToday(27),
      frequency: "twice_daily",
      tasks: ["feeding", "medication", "litter"],
      access: "lockbox",
      pay: "$30 a visit",
      area: "Spruce Hill, 45th and Baltimore",
      vet: "Penn Vet Ryan Hospital",
      notes: "豆豆有糖尿病，每天早晚 8 点各打一次胰岛素，需要有打针经验的人。她怕生，第一次见面会躲床底，过一会儿就好。",
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

const person = (p) => ({ id: p.id, name: p.name, email: `${p.id.replace("seed-", "")}@seed.local` });

const MESSAGES = {
  "seed-sitter-maya": "Hi! I'm Maya, a nursing student near 40th St. I've had dogs and cats all my life and I'm around that week. Happy to send photos every day.",
  "seed-sitter-jordan": "Hey, Jordan here. I run most mornings and would love the company. Big dogs welcome.",
  "seed-sitter-wen": "你好！I'm Wen, I live nearby and have looked after cats for years, including insulin shots. Would love to help.",
  "seed-sitter-sam": "Hi, I'm Sam. I have a fenced yard and a calm senior beagle, and I'm free most weekends.",
};

// ── Commands ─────────────────────────────────────────────────────────────────

async function reset() {
  await sql`DELETE FROM requests WHERE owner_id LIKE 'seed-%'`;
  await sql`DELETE FROM offers WHERE sitter_id LIKE 'seed-%'`;
  await sql`DELETE FROM notifications WHERE user_id LIKE 'seed-%'`;
  await sql`DELETE FROM members WHERE user_id LIKE 'seed-%'`;
}

function must(checked, what) {
  if (!checked.ok) throw new Error(`${what}: ${checked.error}`);
  return checked.value;
}

async function seed() {
  await reset();
  for (const s of SITTERS) await saveMember(sql, person(s), "upenn.edu", must(checkProfile(s.profile), s.name));
  for (const o of OWNERS) {
    await saveMember(sql, person(o), "upenn.edu", must(checkProfile(o.profile), o.name));
    await createRequest(sql, person(o), must(checkDraft(o.request), `${o.name}'s request`));
  }
  console.log(`Added ${SITTERS.length} fake sitters and ${OWNERS.length} fake owners with open requests.`);
  console.log("Sign in as yourself: as a sitter you'll see their requests ranked; as an owner, post a request and run `seed play`.");
}

async function play() {
  let steps = 0;

  // Fake sitters offer on real people's open requests: the two who fit best.
  const open = await sql`
    SELECT r.id, r.pet_name, r.pet_kind, r.pet_kind_other, r.pet_details, r.weekly,
           to_char(r.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(r.ends_on, 'YYYY-MM-DD') AS ends_on,
           r.frequency, r.tasks, r.area, r.care_type, r.must_haves, r.sitter_gender, r.languages,
           m.lat, m.lng, m.area AS member_area
    FROM requests r LEFT JOIN members m ON m.user_id = r.owner_id
    WHERE r.status = 'open' AND r.owner_id NOT LIKE 'seed-%'
  `;
  for (const r of open) {
    const draft = {
      petKind: r.pet_kind,
      petKindOther: r.pet_kind_other,
      weekly: r.weekly,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      frequency: r.frequency,
      tasks: r.tasks,
      area: r.area,
      careType: r.care_type,
      mustHaves: r.must_haves,
      sitterGender: r.sitter_gender,
      languages: r.languages,
    };
    const owner = { point: pointOf({ area: r.member_area ?? "", lat: r.lat, lng: r.lng }, r.area), profile: null };
    const ranked = SITTERS.map((s) => ({ s, score: scoreMatch(s.profile, pointOf(s.profile.location), r.id, draft, owner).score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    for (const { s } of ranked) {
      const [already] = await sql`SELECT 1 FROM offers WHERE request_id = ${r.id} AND sitter_id = ${s.id}`;
      if (already) continue;
      await offerHelp(sql, person(s), r.id, MESSAGES[s.id]);
      console.log(`${s.name} offered to help with ${r.pet_name}.`);
      steps++;
    }
  }

  // Fake owners pick the first sitter who offered.
  const offers = await sql`
    SELECT DISTINCT ON (r.id) r.id AS request_id, r.owner_id, r.pet_name, o.id AS offer_id
    FROM requests r JOIN offers o ON o.request_id = r.id AND o.status = 'pending'
    WHERE r.status = 'open' AND r.owner_id LIKE 'seed-%'
    ORDER BY r.id, o.created_at
  `;
  for (const o of offers) {
    await acceptOffer(sql, o.owner_id, o.offer_id, async (draft, ownerFirstName) => agreementTemplate(draft, ownerFirstName));
    console.log(`The owner of ${o.pet_name} picked a sitter and an agreement is ready.`);
    steps++;
  }

  // Fake people approve agreements waiting on them.
  const waiting = await sql`
    SELECT a.request_id, a.version, r.pet_name,
           CASE WHEN r.owner_id LIKE 'seed-%' AND a.owner_approved_at IS NULL THEN r.owner_id END AS owner_id,
           CASE WHEN o.sitter_id LIKE 'seed-%' AND a.sitter_approved_at IS NULL THEN o.sitter_id END AS sitter_id
    FROM agreements a JOIN requests r ON r.id = a.request_id JOIN offers o ON o.id = a.offer_id
    WHERE r.status = 'matched'
  `;
  for (const w of waiting) {
    for (const userId of [w.owner_id, w.sitter_id].filter(Boolean)) {
      await approveAgreement(sql, userId, w.request_id, w.version);
      console.log(`${userId.startsWith("seed-owner") ? "The owner" : "The sitter"} approved the agreement for ${w.pet_name}.`);
      steps++;
    }
  }

  console.log(steps ? "Done. Refresh PennPaws to see it." : "Nothing for the fake people to do yet. Take your next step, then run this again.");
}

const command = process.argv[2] ?? "seed";
const commands = { seed, play, reset: async () => (await reset(), console.log("Removed the fake people and their requests.")) };
if (!commands[command]) {
  console.error(`Unknown command "${command}". Use seed, play or reset.`);
  process.exit(1);
}
try {
  await commands[command]();
} finally {
  await sql.end();
}
