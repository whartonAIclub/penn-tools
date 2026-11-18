// Email preferences (FOLLOWON-PLAN §2.4): explicit opt-in per category ("exchanges that need you", "matches for your requests and
// alerts"), both off until the person turns one on. Turning one on records the session's PennTools sign-in address at that moment
// (never one typed in Handoff, never a payment contact), the consent version and the time. If the account's address changes later,
// email stops until they turn it on again. Turning a category off always works and skips that person's emails waiting in it: also
// while no dispatcher is working, when the view says a choice that's on is paused (ViewEmail.paused) and the page keeps its panel.
//
// Email can be turned on only while it's available: a dispatcher with this world's sender (the capture for test worlds, a provider
// for live) worked in the last 10 minutes. Until a provider is connected, live never offers it. Real email (the provider, live) is
// never turned on for an account a provider may not send to: the development sign-in, a TEST account, an address outside Penn
// (gates.ts providerAllows; the allowlist is the dispatch route's, checked again at each send). The capture sends nothing, so a test
// world takes any account.

import type { Sql } from "postgres";
import type { WorldId } from "../types.js";
import { cleanAddress, providerAllows, sameAddress } from "./gates.js";
import type { SenderKind, SignInKind, ViewEmail } from "./types.js";

export const CONSENT_VERSION = "v1";
/** A dispatcher run this recent makes email available (and lets the store make jobs). */
export const HEARTBEAT_FRESH_MS = 10 * 60_000;
export const EMAIL_UNAVAILABLE_ERROR = "Email updates aren't available yet.";
export const NO_EMAIL_ADDRESS_ERROR = "Your PennTools account has no email address.";
export const NO_PROFILE_ERROR = "Your profile isn't set up yet. Reload the page and try again.";
/** Turning real email on for the development sign-in, a TEST account or an address outside Penn. */
export const NOT_FOR_THIS_ACCOUNT_ERROR = "Email updates aren't available for this account.";

const TEST_WORLD = /^test-[a-z0-9-]{1,40}$/;
const USER_ID_MAX = 64;

/** The sender a world's email goes through: the capture for test-… worlds, a provider for live. */
export function senderForWorld(worldId: WorldId): SenderKind {
  if (worldId === "live") return "provider";
  if (TEST_WORLD.test(worldId)) return "capture";
  throw new TypeError("Handoff: not a world id.");
}

function assertUserId(id: unknown): asserts id is string {
  if (typeof id !== "string" || id.length === 0 || Array.from(id).length > USER_ID_MAX || id === "system") {
    throw new TypeError("Handoff: not a user id.");
  }
}

function assertNow(now: unknown): void {
  if (now !== undefined && (typeof now !== "number" || !Number.isFinite(now))) throw new TypeError("Handoff: now must be a finite number of ms.");
}

async function clockMs(q: Sql): Promise<number> {
  const [row] = await q<{ ms: number }[]>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms`;
  if (!row) throw new Error("Handoff: the clock query returned no row.");
  return row.ms;
}

/** Whether a dispatcher with this sender worked in the last 10 minutes. */
export async function emailAvailable(sql: Sql, sender: SenderKind, now?: number): Promise<boolean> {
  assertNow(now);
  const at = now ?? (await clockMs(sql));
  const [row] = await sql<{ fresh: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM email_dispatch WHERE sender = ${sender} AND last_ok_at > ${new Date(at - HEARTBEAT_FRESH_MS)}) AS fresh`;
  return row?.fresh === true;
}

interface PrefsRow {
  address: string;
  sign_in: SignInKind;
  exchange_on: boolean;
  matches_on: boolean;
  consent_version: string;
  consented_at: Date;
}

/** The owner's email state for their view (View.email). Reads only; the address is the session's current one (people.email). */
export async function readEmailState(sql: Sql, o: { userId: string; worldId: WorldId; now?: number }): Promise<ViewEmail> {
  assertUserId(o.userId);
  assertNow(o.now);
  const sender = senderForWorld(o.worldId);
  const at = o.now ?? (await clockMs(sql));
  const [row] = await sql<{ current: string | null; address: string | null; exchange_on: boolean | null; matches_on: boolean | null; fresh: boolean; ever: boolean }[]>`
    SELECT pe.email AS current, p.address, p.exchange_on, p.matches_on,
           EXISTS (SELECT 1 FROM email_dispatch d WHERE d.sender = ${sender} AND d.last_ok_at > ${new Date(at - HEARTBEAT_FRESH_MS)}) AS fresh,
           EXISTS (SELECT 1 FROM email_dispatch d WHERE d.sender = ${sender} AND d.last_ok_at IS NOT NULL) AS ever
    FROM (SELECT 1) AS one
    LEFT JOIN people pe ON pe.user_id = ${o.userId}
    LEFT JOIN email_prefs p ON p.user_id = ${o.userId}`;
  const current = cleanAddress(row?.current ?? null);
  const stored = row?.address !== null && row?.address !== undefined;
  const changed = stored && !sameAddress(row?.address ?? null, current);
  const exchange = row?.exchange_on === true && !changed;
  const matches = row?.matches_on === true && !changed;
  const available = row?.fresh === true;
  return {
    available,
    mode: available ? sender : null,
    address: current,
    exchange,
    matches,
    reconfirm: changed && (row?.exchange_on === true || row?.matches_on === true),
    // On, with a sender that has worked before but not lately: the page keeps the way to turn it off (and says nothing is sent now).
    paused: !available && row?.ever === true && (exchange || matches),
  };
}

export interface SaveEmailPrefsInput {
  /** The session's user. */
  userId: string;
  /** The session's sign-in address, as getCurrentUser gives it (null when the account has none). Never typed by the user. */
  address: string | null;
  /** The server's sign-in provider: "google", or "dev" for the local development sign-in. */
  signIn: SignInKind;
  /** The world the request came from: it decides which sender's availability counts. */
  worldId: WorldId;
  /** A category to turn on (true) or off (false); left out, it stays as it is. */
  exchange?: boolean;
  matches?: boolean;
  /** Tests only. */
  now?: number;
}

export type SaveEmailPrefsResult = { ok: true; email: ViewEmail } | { ok: false; error: string };

/**
 * Turns email categories on or off for the session's user. Turning one on needs email to be available, the session to have an
 * address and, for real email (live), an account a provider may send to; it records that address, the consent version and the time.
 * If the address on file is no longer the account's, a category this call doesn't turn on again goes off. Every category that ends
 * up off has its waiting emails skipped ("opted_out").
 */
export async function saveEmailPrefs(sql: Sql, o: SaveEmailPrefsInput): Promise<SaveEmailPrefsResult> {
  assertUserId(o.userId);
  assertNow(o.now);
  if (o.signIn !== "google" && o.signIn !== "dev") throw new TypeError('Handoff: signIn must be "google" or "dev".');
  const sender = senderForWorld(o.worldId);
  for (const v of [o.exchange, o.matches]) {
    if (v !== undefined && typeof v !== "boolean") throw new TypeError("Handoff: exchange and matches are true, false or left out.");
  }
  const outcome = await sql.begin(async (raw): Promise<{ ok: true } | { ok: false; error: string }> => {
    const tx = raw as unknown as Sql; // postgres.js types TransactionSql without Sql's call signatures (store.ts asSql)
    const now = o.now ?? (await clockMs(tx));
    const [person] = await tx<{ email: string | null }[]>`SELECT email FROM people WHERE user_id = ${o.userId} FOR KEY SHARE`;
    if (!person) return { ok: false, error: NO_PROFILE_ERROR };
    const [cur] = await tx<PrefsRow[]>`
      SELECT address, sign_in, exchange_on, matches_on, consent_version, consented_at FROM email_prefs WHERE user_id = ${o.userId} FOR UPDATE`;
    const address = cleanAddress(o.address);
    const same = cur !== undefined && sameAddress(cur.address, address);
    const wasOn = (on: boolean | undefined): boolean => cur !== undefined && on === true && same;
    // What each category becomes: as asked, or as it was while the address on file is still the account's.
    const exchange = o.exchange ?? wasOn(cur?.exchange_on);
    const matches = o.matches ?? wasOn(cur?.matches_on);
    const turnedOn = (o.exchange === true && !wasOn(cur?.exchange_on)) || (o.matches === true && !wasOn(cur?.matches_on));
    if (turnedOn) {
      if (address === null) return { ok: false, error: NO_EMAIL_ADDRESS_ERROR };
      const [d] = await tx<{ fresh: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM email_dispatch WHERE sender = ${sender} AND last_ok_at > ${new Date(now - HEARTBEAT_FRESH_MS)}) AS fresh`;
      if (d?.fresh !== true) return { ok: false, error: EMAIL_UNAVAILABLE_ERROR };
      if (sender === "provider" && !providerAllows(address, o.signIn)) return { ok: false, error: NOT_FOR_THIS_ACCOUNT_ERROR };
    }
    if (cur === undefined && !turnedOn) return { ok: true }; // nothing on, nothing to keep
    const at = new Date(now);
    if (turnedOn && address !== null) {
      await tx`
        INSERT INTO email_prefs (user_id, address, sign_in, exchange_on, matches_on, consent_version, consented_at, updated_at)
        VALUES (${o.userId}, ${address}, ${o.signIn}, ${exchange}, ${matches}, ${CONSENT_VERSION}, ${at}, ${at})
        ON CONFLICT (user_id) DO UPDATE SET address = EXCLUDED.address, sign_in = EXCLUDED.sign_in, exchange_on = EXCLUDED.exchange_on,
          matches_on = EXCLUDED.matches_on, consent_version = EXCLUDED.consent_version, consented_at = EXCLUDED.consented_at,
          updated_at = EXCLUDED.updated_at`;
    } else {
      await tx`UPDATE email_prefs SET exchange_on = ${exchange}, matches_on = ${matches}, updated_at = ${at} WHERE user_id = ${o.userId}`;
    }
    const off = [...(exchange ? [] : ["exchange"]), ...(matches ? [] : ["match"])];
    if (off.length > 0) {
      await tx`
        UPDATE email_jobs SET status = 'skipped', reason = 'opted_out', updated_at = ${at}
        WHERE user_id = ${o.userId} AND category = ANY(${off}::text[]) AND status IN ('pending', 'failed')`;
    }
    return { ok: true };
  });
  if (!outcome.ok) return outcome;
  return { ok: true, email: await readEmailState(sql, { userId: o.userId, worldId: o.worldId, ...(o.now !== undefined ? { now: o.now } : {}) }) };
}
