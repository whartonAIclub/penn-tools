// Email updates (follow-on Batch 4; FOLLOWON-PLAN §2.4, C-CONTRACT §2 View.email): whether the page may show the viewer's email controls,
// and the words they share. The server's view says whether email is available (View.email.available: a dispatcher with this world's
// sender worked in the last 10 minutes) and gives the account's sign-in address. Only then do the Profile panel, the bell's "· email on"
// and the "Also email me matches" boxes render; otherwise nothing of email shows, and the app's wording stays "in the app". The live
// world has no provider connected yet, so its views never say available; the development preview's state has no email at all; a
// guest's view never has one. One exception keeps the way out: while a choice is on and the dispatcher has gone quiet (View.email.paused),
// Profile keeps a panel that can only turn email off (emailPaused); nothing can be turned on, and the bell stays "In the app".
import { LIVE } from "./mode";

/** The viewer's email envelope (View.email) while the page may show email controls, else null. */
export function emailOffer(s) {
  const e = LIVE && s ? s.email : null;
  return e && e.available === true && typeof e.address === "string" && e.address !== "" ? e : null;
}
/** Email updates are on: a category is on and a dispatcher works, so emails can actually be made (the bell's "· email on"). */
export const emailOn = s => { const e = emailOffer(s); return !!e && (e.exchange === true || e.matches === true); };
/**
 * The viewer's envelope while their email updates are on but paused (no dispatcher has worked in the last 10 minutes, though this
 * world's sender has worked before), else null. Profile then keeps its panel with only the choices that are on, to turn them off:
 * an email already waiting is skipped once its category is off. Never an offer: emailOffer is null for the same view.
 */
export function emailPaused(s) {
  const e = LIVE && s ? s.email : null;
  return e && e.available !== true && e.paused === true && typeof e.address === "string" && e.address !== "" && (e.exchange === true || e.matches === true) ? e : null;
}
/** Development's capture sender keeps what would be sent in a test world's own table (scripts/email-captures.mjs); nothing leaves. */
export const CAPTURE_NOTE = "Local test capture: nothing is sent.";
