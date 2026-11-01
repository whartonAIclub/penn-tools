// Boarding requests, sitter must-haves and languages, with no database. The
// example is a real group-chat post (in Chinese) for boarding a cat over
// Thanksgiving, read by a fake AI.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { agreementTemplate } from "../agreement.js";
import { parseSentence, type ParsedRequest } from "../ai.js";
import { checkAsks, scoreMatch } from "../match.js";
import type { SitterProfile } from "../profile.js";
import { checkDraft, describe as describeRequest, type RequestDraft } from "../request.js";

const POST =
  "感恩节猫咪寄养！想找一位靠谱、有养猫经验的人帮忙照顾猫咪，时间：11月18日–30日。猫咪是金渐层，已绝育的小男孩。" +
  "最好是每天都在家，可以每天拍照或发视频报平安～女生优先，寄养费用可商议！有意请私信～";

// What a model should read from the post.
const parsed: ParsedRequest = {
  careType: "boarding",
  mustHaves: ["cat_experience", "home_most_days", "daily_updates"],
  sitterGender: "woman",
  languages: null,
  sourceLanguage: "Chinese",
  petName: null,
  petKind: "cat",
  petKindOther: null,
  petDetails: "Golden British Shorthair, neutered male",
  weekly: false,
  startsOn: "2026-11-18",
  endsOn: "2026-11-30",
  frequency: null,
  frequencyOther: null,
  tasks: null,
  tasksOther: null,
  access: null,
  accessOther: null,
  pay: "Negotiable",
  area: null,
  vet: null,
  notes: null,
};

const boardingRequest: RequestDraft = {
  petName: "Jinjin",
  petKind: "cat",
  petKindOther: null,
  petDetails: "Golden British Shorthair, neutered male",
  photo: null,
  weekly: false,
  startsOn: "2026-11-18",
  endsOn: "2026-11-30",
  frequency: "overnight",
  frequencyOther: null,
  tasks: ["feeding", "litter"],
  tasksOther: null,
  access: "in_person",
  accessOther: null,
  pay: "Negotiable",
  area: null,
  vet: null,
  notes: null,
  careType: "boarding",
  mustHaves: ["cat_experience", "home_most_days", "daily_updates"],
  sitterGender: "woman",
  languages: ["mandarin"],
  original: POST,
  originalLanguage: "Chinese",
};

const catBoarder: SitterProfile = {
  role: "sitter",
  location: { area: "Spruce Hill", lat: 39.951, lng: -75.21 },
  services: ["boarding", "drop_in"],
  petKinds: ["cats"],
  sizes: ["small"],
  energy: ["low", "medium"],
  anxiousOk: true,
  experience: ["owned_cats"],
  travel: "1",
  availability: ["weekday_daytime", "weekends"],
  gender: "woman",
  showGender: false,
  bio: "Grew up with three cats.",
  languages: ["english", "mandarin"],
  boarding: { homeType: "apartment", homeTypeOther: null, hasYard: false, otherPets: null, housingAllowsPets: true, roommatesAgree: true },
};

const dogWalker: SitterProfile = {
  ...catBoarder,
  services: ["walk"],
  petKinds: ["dogs"],
  experience: ["owned_dogs"],
  availability: ["weekends"],
  gender: "man",
  languages: ["english"],
  boarding: null,
};

const noOwner = { point: null, profile: null };

describe("reading a pasted post in another language", () => {
  it("asks for English fields and passes the whole post", async () => {
    const requests: GenerateObjectRequest<never>[] = [];
    const ai = {
      generateObject: async (request: GenerateObjectRequest<never>) => {
        requests.push(request);
        return { object: parsed, provider: "openai", model: "test" };
      },
    } as unknown as AI;
    expect(await parseSentence(ai, "openai", POST, "2026-11-01")).toBe(parsed);
    expect(requests[0]!.messages[0]!.content).toBe(POST);
    expect(requests[0]!.system).toContain("any language");
    expect(requests[0]!.system).toContain("English");
  });
});

describe("a boarding request", () => {
  it("passes the checks and reads in plain words", () => {
    expect(checkDraft(boardingRequest)).toMatchObject({ ok: true });
    const lines = describeRequest(boardingRequest);
    expect(lines.visits).toBe("Boarding at the sitter's home");
    expect(lines.access).toBe("Drop-off and pick-up in person");
    expect(lines.sitter).toBe("Has cared for cats, home most of the day and daily photo or video updates. Prefers a woman sitter. Speaks Mandarin");
  });

  it("puts daily updates into the care agreement", () => {
    expect(agreementTemplate(boardingRequest, "Hai").care).toBe("Feeding, Litter box. A photo or video update every day");
  });

  it("gives older requests without the new fields their defaults", () => {
    const { careType: _c, mustHaves: _m, sitterGender: _g, languages: _l, original: _o, originalLanguage: _ol, ...old } = boardingRequest;
    expect(checkDraft({ ...old, frequency: "twice_daily" })).toMatchObject({
      ok: true,
      value: { careType: "visits", mustHaves: [], sitterGender: "none", languages: [], original: null },
    });
  });
});

describe("ranking a boarding request for sitters", () => {
  it("rates a cat boarder who meets every ask as a great match", () => {
    const match = scoreMatch(catBoarder, null, "r1", boardingRequest, noOwner);
    expect(match.fit).toBe("great");
    expect(match.reasons).toEqual(
      expect.arrayContaining(["You offer boarding at your place", "You look after cats", "You've had cats", "You're free weekday daytimes", "You speak Mandarin"]),
    );
    expect(match.concerns).toEqual([]);
  });

  it("says why a dog walker doesn't fit", () => {
    const match = scoreMatch(dogWalker, null, "r1", boardingRequest, noOwner);
    expect(match.fit).toBe("poor");
    expect(match.concerns).toEqual(
      expect.arrayContaining([
        "Boarding at your place, which you don't offer",
        "You didn't list cats",
        "The owner wants someone who's cared for cats",
        "The owner wants someone home most of the day",
        "The owner prefers a woman sitter",
        "The owner would like a sitter who speaks Mandarin",
      ]),
    );
  });

  it("uses the request's gender preference over the owner's profile", () => {
    const anyone: RequestDraft = { ...boardingRequest, sitterGender: "none" };
    expect(scoreMatch(dogWalker, null, "r1", anyone, noOwner).concerns).not.toContain("The owner prefers a woman sitter");
  });
});

describe("checkAsks, for the owner on each offer", () => {
  it("lists what the sitter has of what the owner asked for", () => {
    expect(checkAsks(boardingRequest, catBoarder)).toEqual({
      fits: ["Offers boarding", "Comfortable with cats", "Has owned cats", "Free weekday daytimes", "Matches your gender preference", "Speaks Mandarin"],
      misses: [],
    });
    expect(checkAsks(boardingRequest, dogWalker).misses).toEqual([
      "Doesn't offer boarding",
      "Doesn't list cats",
      "No cat experience listed",
      "Not free weekday daytimes",
      "Doesn't match your gender preference",
      "Doesn't speak Mandarin",
    ]);
  });

  it("only checks what the owner asked for", () => {
    const plain: RequestDraft = { ...boardingRequest, careType: "visits", mustHaves: [], sitterGender: "none", languages: [] };
    expect(checkAsks(plain, catBoarder)).toEqual({ fits: ["Does walks or drop-ins", "Comfortable with cats"], misses: [] });
  });
});
