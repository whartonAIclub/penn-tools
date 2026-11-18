// Email templates (FOLLOWON-PLAN §2.4): one subject of at most 120 characters, a body of one or two short sentences, the one action
// link on its own line, and the footer. Built only from EmailFacts (relevance.ts), never from a notification's stored text, so no
// payment destination, address, pickup area or time, budget, lowest offer, note, problem reason or exchange amount can reach an email.
// The HTML version says the same, with every value escaped.

import { actionUrl, profileUrl } from "./links.js";
import type { EmailFacts, EmailKind } from "./types.js";

export const SUBJECT_MAX = 120;
export const TEXT_MAX = 2000;
const WHO_MAX = 40;
const TITLE_MAX = 100;
export const FOOTER = "You turned on Handoff email updates. To stop them, open Handoff settings:";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  actionUrl: string;
}

/** The words of one kind: the subject (built around the title, which is shortened to fit) and the body. */
interface Template {
  subject(f: Words, title: string): string;
  body(f: Words): string;
}

/** The facts as the templates use them: one line each, never empty where a template needs them. */
interface Words {
  who: string;
  unit: string;
  due: string;
  qty: string;
  price: string;
  obo: string;
  via: string;
  how: string;
  /** §9x item 1: a free ticket (EmailFacts.free): the two invite-to-pay emails say nothing about paying. */
  free: boolean;
}

const TEMPLATES: Readonly<Record<EmailKind, Template>> = Object.freeze({
  "offer.received": {
    subject: (_f, title) => `Offer on your ${title} ${_f.unit}`,
    body: (f) => `${f.who} made an offer. Accept, counter or decline by ${f.due}.`,
  },
  "offer.accepted": {
    subject: (f, title) => `${f.who} accepted your offer: ${title}`,
    body: (f) => `It's reserved for you until ${f.due}. Pay ${f.who}, then tap "I've sent payment" in Handoff.`,
  },
  "counter.received": {
    subject: (f, title) => `${f.who} countered your offer: ${title}`,
    body: (f) => `Accept or decline by ${f.due}. Accepting reserves it, so accept when you can pay.`,
  },
  "reply.held": {
    subject: (f, title) => `A ${f.unit} is held for your request: ${title}`,
    body: (f) => `${f.who} is holding it for you. Accept by ${f.due} to reserve it.`,
  },
  "payment.reported": {
    subject: (f, title) => `${f.who} says they paid: ${title}`,
    body: () => `Check that it arrived, then tap "Payment received". Handoff can't see payments.`,
  },
  "transfer.sent": {
    subject: (f, title) => `${f.who} sent your ${f.unit}: ${title}`,
    body: () => `Once you have it, tap "Received" in Handoff.`,
  },
  "payment.missing": {
    subject: (f, title) => `${f.who} hasn't received your payment: ${title}`,
    body: (f) => `If you paid, contact ${f.who}. If you didn't, you can cancel.`,
  },
  "item.requested": {
    subject: (f, title) => `${f.who} wants your ${title}`,
    body: (f) => `Accept or decline by ${f.due}.`,
  },
  "item.accepted": {
    subject: (f, title) => `${f.who} accepted your request: ${title}`,
    body: (f) => `It's held for you. Agree a pickup time in Handoff by ${f.due}.`,
  },
  "match.listing": {
    subject: (f, title) => `A ${title} ${f.unit} is available`,
    body: (f) => `${f.qty} at ${f.price}${f.obo} may match your ${f.via}. It isn't held for you.`,
  },
  "match.item": {
    subject: (_f, title) => `Possible match: ${title}`,
    // Forms round 2: an item posted at $0 comes as "Free" (relevance.ts, the engine's itemPrice), and reads as given away.
    body: (f) => (f.price === "Free" ? `A classmate is giving it away for free. It isn't held for you.` : `A classmate is selling it for ${f.price}. It isn't held for you.`),
  },
  "share.listing": {
    subject: (f) => `${f.who} shared a listing for your request`,
    // What the requester can do there now, in the in-app note's words (the engine's shareListing): since invite to pay, ask to buy it.
    body: (f) => `It isn't held for you: ${f.how} on its page.`,
  },
  "share.item": {
    subject: (f) => `${f.who} shared an item for your request`,
    body: () => `It isn't held for you: request it on its page.`,
  },
  // §9x item 1 (SELL6-N1): for a free ticket (f.free) neither email says to pay: nothing is paid, and reserving it is all there is.
  "buy.requested": {
    subject: (f, title) => (f.free ? `${f.who} wants your ${f.unit}: ${title}` : `${f.who} wants to buy: ${title}`),
    body: (f) => (f.free ? `Invite them, or decline, by ${f.due}.` : `Invite them to pay, or decline, by ${f.due}.`),
  },
  "buy.invited": {
    subject: (f, title) => (f.free ? `${f.who} invited you to a free ${f.unit}: ${title}` : `${f.who} invited you to pay: ${title}`),
    // "Up to": a hold is 15 minutes at most, and shorter when the transfer cutoff, the event or a train comes first.
    body: (f) => (f.free ? `It isn't held yet: reserve it by ${f.due}. It's free, so there's nothing to pay.` : `It isn't held yet: reserve it by ${f.due}, then you have up to 15 minutes to pay.`),
  },
  "payment.late": {
    subject: (f, title) => `${f.who} says they paid after the reservation ended: ${title}`,
    body: (f) => `If the money arrived, sort it out with ${f.who}. Handoff can't see payments.`,
  },
});

/** One line of plain text: control characters and runs of white space (line breaks included) become one space. */
export function oneLine(value: unknown): string {
  return (typeof value === "string" ? value : "").replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
}

/** At most `max` characters (code points), ending in "…" when cut. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, Math.max(0, max - 1)).join("").trimEnd() + "…";
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function wordsOf(f: EmailFacts): Words {
  const unit = f.unit === "spot" ? "spot" : f.unit === "item" ? "item" : "ticket";
  return {
    who: clip(oneLine(f.who), WHO_MAX) || "A classmate",
    unit,
    due: oneLine(f.due) || "the deadline shown in Handoff",
    qty: f.qty !== null && Number.isInteger(f.qty) && f.qty > 0 ? plural(f.qty, unit) : `A ${unit}`,
    price: oneLine(f.price) || "the price shown in Handoff",
    obo: f.obo ? " OBO" : "",
    via: f.via === "alert" ? "alert" : "request",
    how: f.how === "request" ? "send a request" : f.how === "reserve" ? "reserve it or make an offer" : "ask to buy it",
    free: f.free === true,
  };
}

/** The subject with the title shortened, if needed, so the whole subject fits in SUBJECT_MAX characters. */
function fitSubject(t: Template, w: Words, rawTitle: string): string {
  let title = clip(oneLine(rawTitle) || "Handoff", TITLE_MAX);
  let subject = oneLine(t.subject(w, title));
  for (let k = 0; Array.from(subject).length > SUBJECT_MAX && k < 4; k++) {
    const over = Array.from(subject).length - SUBJECT_MAX;
    title = clip(title, Math.max(8, Array.from(title).length - over));
    subject = oneLine(t.subject(w, title));
  }
  return clip(subject, SUBJECT_MAX);
}

const ESCAPES: Readonly<Record<string, string>> = Object.freeze({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" });
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** The email for one kind, from its facts and the site's origin; null when its link can't be built. */
export function renderEmail(kind: EmailKind, facts: EmailFacts, siteUrl: string): RenderedEmail | null {
  const t = TEMPLATES[kind];
  const url = actionUrl(kind, facts, siteUrl);
  if (!t || url === null) return null;
  const w = wordsOf(facts);
  const subject = fitSubject(t, w, facts.title);
  const body = oneLine(t.body(w));
  const profile = profileUrl(siteUrl);
  const text = clip(`${body}\n\n${url}\n\n${FOOTER} ${profile}\n`, TEXT_MAX);
  const html =
    `<p>${escapeHtml(body)}</p>\n` +
    `<p><a href="${escapeHtml(url)}">Open in Handoff</a></p>\n` +
    `<p style="color:#5f6b7a;font-size:12px">${escapeHtml(FOOTER)} <a href="${escapeHtml(profile)}">Handoff settings</a></p>\n`;
  return { subject, text, html, actionUrl: url };
}
