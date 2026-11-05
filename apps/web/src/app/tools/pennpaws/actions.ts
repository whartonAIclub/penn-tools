"use server";

// PennPaws's server actions. Each gets the signed-in user, checks the
// browser's input, and calls a function in tools/pennpaws/src. AI is optional
// everywhere: without a saved key, drafting falls back to the template.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so expected problems are returned as data instead.

import { revalidatePath } from "next/cache";
import { isAIError } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  LIMITS,
  PennPawsError,
  acceptOffer,
  agreementTemplate,
  applyChange,
  approveAgreement,
  cancelRequest,
  changeAgreement,
  checkDates,
  checkDraft,
  checkPayment,
  checkPet,
  checkProfile,
  addPet,
  removePet,
  updatePet,
  checkReview,
  clearPayment,
  firstName,
  memberName,
  withdrawOffer,
  addressFrom,
  checkHandoff,
  checkReport,
  fileReport,
  isTeamEmail,
  listOpenReports,
  listTeamMembers,
  recordMatchScore,
  resolveReport,
  setMemberPaused,
  setRequestHidden,
  teamOverview,
  type TeamMember,
  type TeamOverview,
  type TeamReport,
  forgetMember,
  playTestPeople,
  seedTestPeople,
  completeBooking,
  aboutSitter,
  createRequest,
  describe,
  draftMessage,
  getMember,
  getRequestView,
  getTerms,
  firstBookableDay,
  isoDate,
  leaveReview,
  listOpenRequests,
  matchRequests,
  rankMatches,
  GENDERS,
  labelOf,
  listThreads,
  markAllRead,
  noteChange,
  offerHelp,
  parseSentence,
  polishAgreement,
  recordPayment,
  saveMember,
  sendMessage,
  verifySchool,
  type ParsedRequest,
  type Person,
  type RequestView,
  type Thread,
} from "@penntools/tool-pennpaws";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { isPennEmail } from "@/lib/pennEmail";
import { ALLOW_LOCAL_TEST_ACCOUNT } from "./school";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string; kind?: string };

const PATH = "/tools/pennpaws";

function db() {
  const sql = toolSql("pennpaws");
  if (!sql) throw new Error("PennPaws's database is not configured (check DATABASE_URL).");
  return sql;
}

/** The signed-in user, named as they asked at setup (else their Google name). */
async function signedIn(): Promise<Person | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const chosen = await memberName(db(), user.id);
  return { id: user.id, name: chosen ?? user.name ?? "A Penn student", email: user.email };
}

const signedOut = { ok: false, error: "Sign in with your Penn account first." } as const;

/** Today's date in Philadelphia, whatever time zone the server runs in. */
function pennToday(): Date {
  const [year, month, day] = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Runs `fn`, turning PennPawsError and AIError into data the page can show. */
async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof PennPawsError) return { ok: false, error: error.message };
    if (isAIError(error)) return { ok: false, error: error.toJSON().message, kind: error.kind };
    throw error;
  }
}

/** The signed-in user's AI and their first provider with a saved key, if any. */
async function userAI(): Promise<{ ai: AI; provider: AIProvider } | null> {
  const ai = await getAI();
  const provider = ai ? (await ai.providers())[0] : undefined;
  return ai && provider ? { ai, provider } : null;
}

// ── First-time setup ──────────────────────────────────────────────────────────

/** Saves the role and survey answers. Only members signed in with a Penn email (the pilot school) may join. */
export async function saveProfile(input: unknown, name: unknown): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  const school = verifySchool(user.email, ALLOW_LOCAL_TEST_ACCOUNT);
  if (!school) return { ok: false, error: "PennPaws is open to Penn for now. Log out, then sign in with your Penn account." };
  const checked = checkProfile(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  const chosen = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!chosen) return { ok: false, error: "Tell us what to call you." };
  if (chosen.length > LIMITS.name) return { ok: false, error: `Keep your name under ${LIMITS.name} characters.` };
  return run(async () => {
    await saveMember(db(), { ...user, name: chosen }, school, checked.value);
    return null;
  });
}

// ── My Pets ───────────────────────────────────────────────────────────────────

/** Adds a pet to My Pets, or updates one when `petId` is given. Only the owner's own pets. */
export async function savePet(petId: unknown, input: unknown): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  const checked = checkPet(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(async () => {
    if (typeof petId === "string" && petId) {
      const changed = await updatePet(db(), user.id, petId, checked.value);
      if (!changed) throw new PennPawsError("That pet isn't on your list.");
    } else {
      await addPet(db(), user.id, checked.value);
    }
    return null;
  });
}

/** Takes a pet off My Pets. Requests already posted keep their own copy of the answers. */
export async function deletePet(petId: unknown): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  if (typeof petId !== "string" || !petId) return { ok: false, error: "Pick a pet to remove." };
  return run(async () => {
    const removed = await removePet(db(), user.id, petId);
    if (!removed) throw new PennPawsError("That pet isn't on your list.");
    return null;
  });
}

// ── Owner ─────────────────────────────────────────────────────────────────────

export async function postRequest(input: unknown): Promise<ActionResult<string>> {
  const user = await signedIn();
  if (!user) return signedOut;
  const checked = checkDraft(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  const tooSoon = checkDates(checked.value, firstBookableDay(pennToday()));
  if (tooSoon) return { ok: false, error: tooSoon };
  return run(() => createRequest(db(), user, checked.value));
}

/** Survey answers found in one sentence. Needs a saved API key. */
export async function parseRequest(sentence: string): Promise<ActionResult<ParsedRequest>> {
  if (!(await signedIn())) return signedOut;
  if (typeof sentence !== "string" || !sentence.trim()) return { ok: false, error: "Describe what you need first." };
  if (sentence.length > LIMITS.sentence) return { ok: false, error: `Keep it under ${LIMITS.sentence} characters.` };
  const ai = await userAI();
  if (!ai) return { ok: false, error: "Save an API key in Settings to use this, or answer the questions instead.", kind: "missing_key" };
  return run(() => parseSentence(ai.ai, ai.provider, sentence, isoDate(pennToday())));
}

/** Accepts an offer and drafts the agreement: the template, polished by AI when the owner has a key. */
export async function accept(offerId: string): Promise<ActionResult<string>> {
  const user = await signedIn();
  if (!user) return signedOut;
  const ai = await userAI();
  return run(() =>
    acceptOffer(db(), user.id, String(offerId), async (draft, ownerFirstName, sitterMessage) => {
      const terms = agreementTemplate(draft, ownerFirstName);
      if (!ai) return terms;
      try {
        return await polishAgreement(ai.ai, ai.provider, terms, sitterMessage);
      } catch (error) {
        if (isAIError(error)) return terms; // a key problem shouldn't block the booking
        throw error;
      }
    }),
  );
}

export async function cancel(requestId: string, reason: string | null): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  return run(async () => {
    await cancelRequest(db(), user.id, String(requestId), typeof reason === "string" ? reason : null);
    return null;
  });
}

/** The sitter takes back their offer, or backs out after being picked. */
export async function withdraw(requestId: string, reason: string | null): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  return run(async () => {
    await withdrawOffer(db(), user, String(requestId), typeof reason === "string" ? reason : null);
    return null;
  });
}

/** Rates a finished booking. The sitter sees the rating without the owner's name or the booking. */
export async function rate(requestId: string, input: unknown): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  const checked = checkReview(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(async () => {
    await leaveReview(db(), user.id, String(requestId), checked.value);
    return null;
  });
}

// ── Sitter ────────────────────────────────────────────────────────────────────

export interface AIMatch {
  score: number;
  reason: string;
  concern: string | null;
}

/** How many of the rules' best requests the AI re-ranks; the rest keep the rules order. */
const AI_MATCH_LIMIT = 10;

/** The AI's ranking of the open requests that best fit the signed-in sitter, by request id. */
export async function aiMatches(): Promise<ActionResult<Record<string, AIMatch>>> {
  const user = await signedIn();
  if (!user) return signedOut;
  const ai = await userAI();
  if (!ai) return { ok: false, error: "Add an AI key in Settings to rank jobs with AI." };
  const sql = db();
  const member = await getMember(sql, user.id);
  if (member?.profile.role !== "sitter") return { ok: false, error: "Matching is for sitters. Switch your role in My profile." };
  const sitter = member.profile;
  try {
    const open = (await listOpenRequests(sql, user.id)).filter((r) => !r.mine);
    const byId = new Map(open.map((r) => [r.id, r]));
    const best = (await matchRequests(sql, sitter, open)).filter((m) => m.fit !== "poor").slice(0, AI_MATCH_LIMIT);
    const aboutMe = `${aboutSitter(sitter)} Gender: ${labelOf(GENDERS, sitter.gender).toLowerCase()}. Area: ${sitter.location.area}.`;
    const ranked = await rankMatches(
      ai.ai,
      ai.provider,
      aboutMe,
      best.flatMap((m) => {
        const request = byId.get(m.requestId);
        if (!request) return [];
        const lines = describe(request.draft);
        const d = request.draft;
        return [
          {
            id: m.requestId,
            request: {
              pet: `${d.petName}, ${lines.pet}`,
              when: lines.when,
              visits: lines.visits,
              care: lines.care,
              pay: d.pay,
              area: d.area,
              notes: d.notes,
              sitterWanted: lines.sitter,
              originalPost: d.original,
            },
            rules: { score: m.score, reasons: m.reasons, concerns: m.concerns },
          },
        ];
      }),
    );
    return { ok: true, data: Object.fromEntries(ranked.map((m) => [m.id, { score: m.score, reason: m.reason, concern: m.concern }])) };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON().message, kind: error.kind };
    throw error;
  }
}

export async function offer(requestId: string, message: string): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  return run(async () => {
    const sql = db();
    const sitter = await getMember(sql, user.id);
    if (sitter?.role !== "sitter") throw new PennPawsError("Only sitters can offer. Switch to sitter in My profile first.");
    await offerHelp(sql, user, String(requestId), String(message ?? ""));
    // Keep the match score, so the team can see whether sitters act on good matches.
    if (sitter.profile.role === "sitter") {
      const request = (await listOpenRequests(sql, user.id)).find((r) => r.id === String(requestId));
      const [match] = request ? await matchRequests(sql, sitter.profile, [request]) : [];
      if (match) await recordMatchScore(sql, match.requestId, user.id, match.score);
    }
    return null;
  });
}

/** Records what the sitter was paid for a booking (money moves outside PennPaws). */
export async function savePayment(requestId: string, input: unknown): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  const checked = checkPayment(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(async () => {
    await recordPayment(db(), user.id, String(requestId), checked.value);
    return null;
  });
}

export async function removePayment(requestId: string): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  return run(async () => {
    await clearPayment(db(), user.id, String(requestId));
    return null;
  });
}

// ── Both ──────────────────────────────────────────────────────────────────────

/** A request as the viewer may see it, with the message threads they may read. */
export type RequestPage = RequestView & { threads: Thread[] };

export async function loadRequest(requestId: string): Promise<RequestPage | null> {
  const user = await signedIn();
  if (!user) return null;
  const sql = db();
  const [view, threads] = await Promise.all([getRequestView(sql, user.id, String(requestId)), listThreads(sql, user.id, String(requestId))]);
  if (!view) return null;
  // Other people's requests are for sitters (and the team, to check reports); owners only open their own and ones they're part of.
  if (!view.mine && view.role === null && !isTeamEmail(user.email, ALLOW_LOCAL_TEST_ACCOUNT)) {
    const member = await getMember(sql, user.id);
    if (member?.role !== "sitter") return null;
  }
  return { ...view, threads };
}

/** Sends a message: a sitter in their own thread, the owner in the thread they reply to. */
export async function message(requestId: string, body: string, threadId: string | null): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  if (typeof body !== "string" || body.length > LIMITS.message) return { ok: false, error: `Keep it under ${LIMITS.message} characters.` };
  return run(async () => {
    await sendMessage(db(), user, String(requestId), body, threadId ? String(threadId) : null);
    return null;
  });
}

/** An AI draft of the viewer's next message in a thread, for them to edit and send. Needs a saved API key. */
export async function draftNextMessage(requestId: string, threadId: string | null): Promise<ActionResult<string>> {
  const user = await signedIn();
  if (!user) return signedOut;
  const ai = await userAI();
  if (!ai) return { ok: false, error: "Save an API key in Settings to get help writing, or type your message.", kind: "missing_key" };
  const sql = db();
  const [view, threads, member] = await Promise.all([
    getRequestView(sql, user.id, String(requestId)),
    listThreads(sql, user.id, String(requestId)),
    getMember(sql, user.id),
  ]);
  if (!view) return { ok: false, error: "That request doesn't exist." };
  const thread = view.mine ? threads.find((t) => t.id === threadId) : threads[0];
  if (!thread?.canSend) return { ok: false, error: "This conversation is closed." };
  const lines = describe(view.draft);
  return run(() =>
    draftMessage(ai.ai, ai.provider, {
      writer: view.mine ? "owner" : "sitter",
      writerFirstName: firstName(user.name),
      otherFirstName: view.mine ? thread.sitterFirstName : view.ownerFirstName,
      request: { pet: `${view.draft.petName}, ${lines.pet}`, when: lines.when, visits: lines.visits, care: lines.care, keys: lines.access, pay: view.draft.pay, area: view.draft.area, vet: view.draft.vet, notes: view.draft.notes },
      aboutMe: !view.mine && member?.profile.role === "sitter" ? aboutSitter(member.profile) : null,
      thread: thread.messages.map((m) => ({ fromMe: m.mine, body: m.body })),
    }),
  );
}

/** Approves the agreement, sharing a phone number (and the address, for whoever hosts the care) for once both approve. */
export async function approve(requestId: string, version: number, handoff: unknown): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  if (!Number.isInteger(version)) return { ok: false, error: "Reload the page and try again." };
  const sql = db();
  const view = await getRequestView(sql, user.id, String(requestId));
  if (!view?.role) return { ok: false, error: "This agreement can't be approved now." };
  const checked = checkHandoff(handoff, addressFrom(view.draft.careType) === view.role);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(async () => {
    await approveAgreement(sql, user.id, String(requestId), version, checked.value);
    return null;
  });
}

export async function markDone(requestId: string): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  return run(async () => {
    await completeBooking(db(), user.id, String(requestId));
    return null;
  });
}

/** Applies the change with AI when the user has a key; otherwise records it in the notes. */
export async function askForChange(requestId: string, change: string): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  const text = typeof change === "string" ? change.trim() : "";
  if (!text) return { ok: false, error: "Say what you'd like to change." };
  if (text.length > LIMITS.message) return { ok: false, error: `Keep it under ${LIMITS.message} characters.` };
  const sql = db();
  const current = await getTerms(sql, user.id, String(requestId));
  if (!current) return { ok: false, error: "This agreement can't be changed now." };
  const ai = await userAI();
  return run(async () => {
    let terms = noteChange(current.terms, text, current.me);
    if (ai) {
      try {
        terms = await applyChange(ai.ai, ai.provider, current.terms, text);
      } catch (error) {
        if (!isAIError(error)) throw error;
      }
    }
    await changeAgreement(sql, user.id, String(requestId), terms, text);
    return null;
  });
}

export async function readNotifications(): Promise<void> {
  const user = await signedIn();
  if (!user) return;
  await markAllRead(db(), user.id);
  revalidatePath(PATH);
}

// ── Test menu (local development only) ────────────────────────────────────────

/** Only the platform's local test user, and only under `pnpm dev`. Real Penn accounts never get these. */
async function testUser(): Promise<Person | null> {
  const user = await signedIn();
  return ALLOW_LOCAL_TEST_ACCOUNT && user && !isPennEmail(user.email) ? user : null;
}

const notTesting = { ok: false, error: "The test menu only works for the local test user under pnpm dev." } as const;

/** Has the fake people take their next step: offer on your requests, pick you, approve agreements. */
export async function testPlay(): Promise<ActionResult<string[]>> {
  if (!(await testUser())) return notTesting;
  return run(() => playTestPeople(db()));
}

/** Wipes the test user's PennPaws data and brings back a fresh set of fake people, so setup starts again. */
export async function testStartOver(): Promise<ActionResult> {
  const user = await testUser();
  if (!user) return notTesting;
  return run(async () => {
    await forgetMember(db(), user.id);
    await seedTestPeople(db());
    return null;
  });
}

// ── Reports and the team view ─────────────────────────────────────────────────

/** Reports a request (its owner) or an offer (its sitter) to the PennPaws team. */
export async function report(input: unknown): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  const checked = checkReport(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(async () => {
    await fileReport(db(), user.id, checked.value);
    return null;
  });
}

async function teamUser(): Promise<Person | null> {
  const user = await signedIn();
  return user && isTeamEmail(user.email, ALLOW_LOCAL_TEST_ACCOUNT) ? user : null;
}

const notTeam = { ok: false, error: "Only the PennPaws team can see this." } as const;

export interface TeamData {
  overview: TeamOverview;
  members: TeamMember[];
  reports: TeamReport[];
}

export async function loadTeam(): Promise<ActionResult<TeamData>> {
  if (!(await teamUser())) return notTeam;
  const sql = db();
  const [overview, members, reports] = await Promise.all([teamOverview(sql), listTeamMembers(sql), listOpenReports(sql)]);
  return { ok: true, data: { overview, members, reports } };
}

export async function teamResolve(reportId: string): Promise<ActionResult> {
  if (!(await teamUser())) return notTeam;
  return run(async () => resolveReport(db(), String(reportId)).then(() => null));
}

export async function teamHide(requestId: string, hidden: boolean): Promise<ActionResult> {
  if (!(await teamUser())) return notTeam;
  return run(async () => setRequestHidden(db(), String(requestId), hidden === true).then(() => null));
}

export async function teamPause(userId: string, paused: boolean): Promise<ActionResult> {
  if (!(await teamUser())) return notTeam;
  return run(async () => setMemberPaused(db(), String(userId), paused === true).then(() => null));
}
