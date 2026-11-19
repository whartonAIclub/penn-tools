// Handoff's shared building blocks, used across its pages (moved unchanged from HandoffPrototype.jsx): card price copy (priceLines);
// icons (Icon), avatars, state badges and event covers (live: an event's look, the same as its cards' tile, LookTile, in the boards' card header, BoardBand); dialog focus (useDialog); radio groups made of buttons (onRadioKeys, rov,
// TypeSwitch); copying text (copyText); an event's transfer chip, policy details, sources and a trip's cost breakdown; the back button of
// an event, item or request page (BackButton); where a post lands (PostedNote, §9v item 3); a progress timeline (Timeline); and the
// inline confirmation (Confirm).
// LIVE and GUEST come from _lib/mode and are read where they're used: an import is a live binding, so each read sees App's latest
// setMode. This module imports no other feature module.
import React, { useState, useEffect, useRef } from "react";
import {
  CLOCK, PEOPLE, CATS, EV, atMs, fmtDate, fmtWhen, money, initials, paidToDate, remainingItems, commitment, access, isQuick, priceParts,
  priceBasis, transferTag, faceOf, listingRestrictions
} from "@penntools/tool-handoff/engine";
import { LIVE, GUEST } from "../_lib/mode";
import { demoQuery } from "../_lib/dom";
import { catLook, VIEW_LABEL } from "../_lib/routes";
import { eventLook, lookKey } from "../_lib/look";
import { OWN_LABEL, clubKeyFor } from "../_lib/cards";
import { sourceLine, basisLine } from "../_lib/plain"; // §9x item 4 (SELL6-N3, live): who added an event and who entered its face value, without "not checked by Handoff"

/* Card and booking-panel price copy. Research provenance (which year a price is from) lives in SourceBody. */
export function priceLines(ev, sum) {
  const p = priceParts(ev, sum); // the text comes from the engine; this adds the markup
  return { main: <>{p.main.pre}<b>{p.main.bold}</b>{p.main.post}</>, sub: p.sub };
}

/* ============================================================
   ICONS (inline, lucide-style)
   ============================================================ */
const PATHS = {
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
  ticket: <><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  check: <path d="M20 6 9 17l-5-5"/>,
  x: <path d="M18 6 6 18M6 6l12 12"/>,
  clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  help: <><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></>,
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>,
  arrow: <path d="M5 12h14M12 5l7 7-7 7"/>,
  back: <path d="M19 12H5M12 19l-7-7 7-7"/>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/></>,
  map: <><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
  min: <path d="M5 12h14"/>,
  share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></>,
  hand: <><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></>,
  chev: <path d="m6 9 6 6 6-6"/>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></>,
  ext: <><path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  wine: <><path d="M8 22h8M7 10h10M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/></>,
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>,
  plane: <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>,
  globe: <><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  flask: <><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/><path d="M7 15h10"/></>,
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>,
  train: <><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M12 3v8M8 22l2-4M16 22l-2-4"/><path d="M9 15h.01M15 15h.01"/></>,
  sofa: <><path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0Z"/><path d="M4 18v2M20 18v2"/></>,
  home: <><path d="M3 10 12 3l9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  shirt: <path d="M20.4 6.6 16 4a4 4 0 0 1-8 0L3.6 6.6a1 1 0 0 0-.5 1.2l.9 3a1 1 0 0 0 1.2.6L7 11v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-9l1.8.4a1 1 0 0 0 1.2-.6l.9-3a1 1 0 0 0-.5-1.2Z"/>,
  mountain: <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>,
  book: <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></>,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></>,
  tag: <><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z"/><path d="M7.5 7.5h.01"/></>,
  star: <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>,
};
export function Icon({ name, size = 18, style }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{PATHS[name]}</svg>;
}
export function Avatar({ id, size = 26 }) {
  const p = PEOPLE[id];
  return <span className="av" style={{ background: p.color, width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{initials(p.name)}</span>;
}
export function StateBadge({ state }) { return <span className={"state " + (state.tone || "")}><i />{state.label}</span>; }
/* §9v item 1 (live, SELL5-M4; it supersedes §9s item 7's tiles): an event's look (_lib/look.js eventLook) is the icon of the row
   category it's listed under (ticket, train or mountain), the same on its page, a lookup row and both boards' cards. Decorative: the
   words beside it say the same. §9x item 2 (SELL6-N2): which icon that is, is chosen again (look.js: a stated category, a cue in the
   title, or the neutral ticket), still one look per event wherever it shows. */
export function Cover({ ev, className, size = 56, children }) {
  if (LIVE) { const lk = eventLook(ev); return <div className={"cover look " + (className || "")} style={{ "--c": lk.color }} data-look={lookKey(lk)} aria-hidden={children ? undefined : "true"}><span className="look-mark"><Icon name={lk.icon} size={size} /></span>{children}</div>; }
  const [icon, color] = catLook(ev.cat); // the preview: an event added without a category (simplification batch) gets the plain ticket look
  return <div className={"cover " + (className || "")} style={{ "--c": color }} aria-hidden={children ? undefined : "true"}><Icon name={icon} size={size} />{children}</div>;
}
/* A card's small square picture (live): its look (_lib/look.js) as a tile, the row category's icon, or for Goods the seller's real photo.
   If that photo can't be had (the item ended a moment ago), the bag. Decorative, like Cover. */
export function LookTile({ look, size = 56 }) { // §9x item 2: drawn large; the styles size it (a prominent icon on a wide card's header, a small tile on a phone's band)
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [look.src]);
  const lk = look.kind === "photo" && bad ? { ...look, kind: "icon" } : look;
  return (
    <span className={"look-tile " + lk.kind} style={{ "--c": lk.color }} data-look={lookKey(lk)} aria-hidden="true">
      {lk.kind === "photo" ? <img src={lk.src} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} /> : <Icon name={lk.icon} size={size} />}
    </span>
  );
}
/* §9v item 1 and §9w (live, SELL5-M4): every card on Available and Wanted leads with the same compact coloured header: its picture
   (LookTile) and one line, a state pill ("1 ticket available"; on Wanted, "2 tickets wanted · Up to $30 each"), with a real restriction
   at its end ("GCC members only"). The card's name, its date once and the price (Available) follow in its body. data-look names the
   picture, as on Cover. */
/* §9x items 2 and 3 (live, SELL6-N2): on a wide screen the header is taller again (the proportions Available's cards had before §9v,
   a little lower) with the picture large in its middle and the pill at its top left; on a phone it stays the compact band, the picture
   a small tile beside the pill. The picture is the look's own icon and colour (look.js: a stated category, a cue in the title, or the
   neutral ticket), so White Wine Varietals and Spring Formal differ. OwnTag: the small "Your listing" label an owner's own card wears
   where the others have their pill (a ticket's or an item's). */
export function OwnTag() { return <span className="tag2 own-tag" data-own-tag="">{OWN_LABEL}</span>; }
export function BoardBand({ look, children }) {
  return <div className="cover look band" style={{ "--c": look.color }} data-look={lookKey(look)}><LookTile look={look} />{children}</div>;
}
/* §9y (live, SELL7-O1): a card's club on its own quiet line under the date, with By club's people icon (names: cards.js cardClubs).
   Each club By club lists is a button that applies it there (onClub: its key, clubKeyFor), above the card's own link; one it doesn't
   list is plain text. Nothing at all when the card names no club. */
export function CardClub({ names, onClub }) {
  if (!names || !names.length) return null;
  return (
    <span className="meta card-club" data-card-club="">
      <Icon name="users" size={14} />
      {names.map((n, i) => { const k = onClub ? clubKeyFor(n) : null; return (
        <React.Fragment key={n}>
          {i > 0 && <span aria-hidden="true">·</span>}
          {k ? <button type="button" className="club-tap" aria-label={`Show only ${n}`} title={`Show only ${n}`} onClick={e => { e.stopPropagation(); onClub(k); }}>{n}</button>
            : <span className="club-name">{n}</span>}
        </React.Fragment>); })}
    </span>
  );
}
/* Dialog focus: move focus in, keep Tab inside, close on Escape, restore focus on close. */
export function useDialog(ref, onClose) {
  useEffect(() => {
    const prev = document.activeElement; const el = ref.current; if (!el) return;
    const h = el.querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
    const focusables = () => [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && !x.hidden && x.offsetParent !== null);
    const onKey = e => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === h || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Back to what opened it; if that's gone (the page changed underneath), to the page heading.
      const back = prev && prev !== document.body && document.contains(prev) ? prev : null;
      const h1 = !back && demoQuery("[data-handoff-content] h1"); if (h1) h1.setAttribute("tabindex", "-1");
      const t = back || h1 || demoQuery('.persona-btn, button[aria-label="Handoff settings"]'); if (t) t.focus({ preventScroll: true }); // the header's last control: the preview's account menu, or (live) Handoff settings
    };
  }, []);
}
/* Radio groups made of buttons: arrow keys move and select; only the selected option is in the Tab order. */
export function onRadioKeys(e) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!step) return;
  const items = [...e.currentTarget.querySelectorAll("[role=radio]")]; const i = items.indexOf(document.activeElement); if (i < 0) return;
  e.preventDefault(); const nx = items[(i + step + items.length) % items.length]; nx.focus(); nx.click();
}
export const rov = (checked, idx, anyChecked) => (checked || (!anyChecked && idx === 0) ? 0 : -1);
/* A required field's marker (§9q item 5), inside its label: an asterisk people see and screen readers skip, then "(required)" for
   screen readers only, so the field's accessible name says it ("Asking price per ticket (required)"). The field itself also carries
   aria-required. */
export function Req() { return <><span className="req-star" aria-hidden="true"> *</span><span className="sr"> (required)</span></>; }
/* The posting forms' type choice, at the top of both Sell forms and Post a request: Tickets & trips or Goods. A radio group of two buttons
   (arrow keys move and choose; only the chosen one is in the Tab order). Choosing the chosen one does nothing, and nothing is submitted. */
export function TypeSwitch({ value, onPick, label, idp }) {
  return (
    <div className="type-switch" role="radiogroup" aria-label={label} onKeyDown={onRadioKeys}>
      {[["tickets", "Tickets & trips", "ticket"], ["goods", "Goods", "bag"]].map(([k, text, icon]) => (
        <button key={k} id={`${idp}-type-${k}`} type="button" role="radio" aria-checked={value === k} tabIndex={value === k ? 0 : -1} className={value === k ? "on" : undefined}
          onClick={() => { if (value !== k) onPick(k); }}><Icon name={icon} size={16} />{text}</button>
      ))}
    </div>
  );
}
export async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) { if (fallbackEl) { fallbackEl.hidden = false; fallbackEl.focus(); fallbackEl.select(); } return false; }
}
/* An event's transfer tag; none (§9v item 5) when it has no label: an event whose organizer stated no rule shows nothing. */
export function TransferChip({ ev }) { const t = transferTag(ev); if (!t.label) return null; return <span className={"chip tone-" + t.tone}><Icon name={t.icon} size={13} />{t.label}</span>; }
/* §9v items 4 and 5 (live, SELL5-M2): a listing's terms as buyers read them. The club its seller named (for an event that names none:
   informational, plain text, never a warning) and its restrictions in plain words (the engine's listingRestrictions: "GCC members only",
   "The organizer must change the name on the ticket", the seller's own words, or an older listing's flag). None reported or known:
   nothing at all. noted: a visitor's view, which says only that the seller noted a restriction of their own (its words are the seller's
   text, read once signed in). list: the full list before asking to buy or reserving (a callout); otherwise one line of chips (a row).
   own: leave out what the event's own page already says for every listing (members only by the event, names checked at its door). */
export function ListingTerms({ ev, l, list = false, noted = false, own = false, skip = null }) { // skip: kinds said elsewhere on the same form (the members-only confirmation)
  if (!ev || !l) return null;
  const rs = listingRestrictions(ev, l).filter(r => !(skip && skip.includes(r.kind)) && (!own || !((r.kind === "members" && ev.attend === "members") || (r.kind === "name" && ev.namesChecked))));
  const club = !ev.club && typeof l.club === "string" && l.club ? l.club : "";
  if (list) return rs.length || noted ? <div className="callout restrictions" data-restrictions=""><b>{rs.length + (noted ? 1 : 0) === 1 ? "Restriction" : "Restrictions"}</b>
    <ul>{rs.map(r => <li key={r.kind} data-restriction={r.kind}>{r.text}</li>)}{noted && <li data-restriction="noted">The seller noted a restriction of their own. Sign in to read it before you ask to buy.</li>}</ul></div> : null;
  if (!rs.length && !club && !noted) return null;
  return <div className="note terms" data-terms="">{club && <span className="listing-club" data-listing-club="">{club}</span>}
    {rs.map(r => <span key={r.kind} className="chip restrict-chip" data-restriction={r.kind}><Icon name="lock" size={13} />{r.text}</span>)}
    {noted && <span className="chip restrict-chip" data-restriction="noted"><Icon name="lock" size={13} />Restriction noted by the seller · sign in to read it</span>}</div>;
}
export function PolicyDetails({ ev, compact, chip = true }) {
  const t = transferTag(ev); const train = ev.cat === "Travel";
  // Student tickets: pay first, then the seller transfers it; the club's own step only where names are checked or it approves swaps.
  const how = isQuick(ev) && access(ev).ok && !train && !ev.nonTransferable
    ? `The buyer pays first, then the seller transfers it.${ev.namesChecked ? ` Names are checked at the door: ${ev.path}` : ev.policy !== "permitted" && !(LIVE && ev.policy === "unknown") && ev.path ? ` ${ev.path}` : ""}` : ev.path; // §9v item 5 (live): no generic "check the organizer's rules" where no rule is stated
  if ((!chip || !t.label) && !t.line && compact) return null; // §9v item 5: an event with no tag and nothing to say shows nothing here
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      {chip && !!t.label && <div><TransferChip ev={ev} /></div>}
      {t.line && <span className="muted" style={{ fontSize: 13.5 }}>{t.line}</span>}
      {!compact && (
        <details className="srcs"><summary>Details and sources</summary>
          <div className="srcs-body">
            <dl className="facts">
              <dt>{ev.nonTransferable ? "Instead" : ev.policy === "official" ? "Official process" : "How it's passed on"}</dt><dd>{how}{!LIVE && !train && !/^Illustrative/.test(how) && <span className="muted"> (illustrative)</span>}</dd>
              {!train && <><dt>Deadline</dt><dd>{ev.deadline ? `${atMs(ev.deadline) <= CLOCK ? "Closed" : "Transfers until"} ${fmtWhen(ev.deadline)}` : LIVE ? "None given" : "None published"} {LIVE ? <span className="muted">(as entered)</span> : <span className="muted">(illustrative)</span>}</dd></>}
              <dt>Official page</dt><dd>{ev.officialUrl ? <a href={ev.officialUrl} target="_blank" rel="noopener noreferrer">{ev.officialUrl.replace(/^https:\/\//, "").split("/").slice(0, 2).join("/")}</a> : <span className="muted">{GUEST ? "Shown once you sign in, if one was given" : "Not linked"}</span>}</dd>{/* a guest never gets an event's link (C-CONTRACT §7) */}
            </dl>
            {ev.ticketRules && <><b>{ev.club}'s rules</b><ul>{ev.ticketRules.map(x => <li key={x}>{x}</li>)}</ul></>}
            <SourceBody ev={ev} />
          </div>
        </details>
      )}
    </div>
  );
}

/* Research provenance, collapsed by default: what each price is based on, and the public pages behind the facts. */
function SourceBody({ ev }) {
  return (
    <>
      {ev.premium
        ? <span><b>Trip price {money(ev.price.total)}:</b> {ev.price.note}</span>
        : ev.tiers.some(t => faceOf(t) != null) && <ul>{ev.tiers.filter(t => faceOf(t) != null).map(t => <li key={t.id}><b>{t.label} {money(t.price)}:</b> {LIVE ? basisLine(priceBasis(t.src)) : priceBasis(t.src)}</li>)}</ul>}{/* forms round 2: a face value only where one was given */}
      {ev.sources && !(LIVE && !ev.sources.length) && <>
        <b>From public pages</b>
        <ul>{ev.sources.map(src => <li key={src.url + src.text}>{src.text} <a href={src.url} target="_blank" rel="noopener noreferrer">Source</a></li>)}</ul>
      </>}
      <span className="muted" data-ev-source-note="">{LIVE ? `${sourceLine(ev.sourcesNote).replace(/\.$/, "")}. Handoff isn't affiliated with ${ev.club || (ev.cat === "Travel" ? "the carrier" : "the organizer")}, and ${ev.cat === "Travel" ? "the carrier's" : ev.club ? "the organizer's" : "their"} own rules still apply.` // an event may name no organizer (simplification batch)
        : ev.cat === "Travel"
        ? `${ev.sourcesNote} Dates, demo prices and listings are illustrative. Handoff isn't affiliated with ${ev.club}, and its terms still apply. Not legal advice.`
        : ev.organizerRequired ? "Based on the 2024 trek's public pages above. Dates, demo prices and listings are illustrative; the 2026 trek's operator and transfer terms aren't confirmed."
        : "Club names and event types are real. Dates, demo prices, listings and transfer policies are illustrative unless a source above says otherwise, and none is confirmed with the organizer."}</span>
    </>
  );
}
/* Trip cost breakdown: paid so far, reimbursement, remaining payments, fees and total. */
export function CostBreakdown({ ev, reimb, paid, topUp }) {
  const pr = ev.price; const showListing = reimb != null; const fut = showListing ? remainingItems(ev, paid) : [];
  return (
    <div className="breakdown-wrap"><table className="breakdown"><tbody>
      {!showListing && pr.schedule.map(p => (
        <tr key={p.label}><td>{p.label}<span className="sub">Due {fmtDate(p.due)}{atMs(p.due) <= CLOCK ? " · already due" : ""}</span></td><td>{money(p.amount)}</td></tr>
      ))}
      {!showListing && <tr className="total"><td>Trip price ({pr.currency}){pr.note && <span className="sub">{pr.note}</span>}</td><td>{money(pr.total)}</td></tr>}
      {!showListing && pr.fee > 0 && <tr><td>Plus, for a replacement: change fee<span className="sub">{pr.feeNote}. Not part of the trip price.</span></td><td>{money(pr.fee)}</td></tr>}
      {showListing && <>
        <tr><td>Seller has paid so far<span className="sub">Per the organizer's schedule (demo figures). Context, not part of your total.</span></td><td>{money(paid)}</td></tr>
        <tr><td><b>Reimbursement to seller</b><span className="sub">Paid to the seller directly, only after the club confirms</span></td><td><b>{money(reimb)}</b></td></tr>
        {fut.map(p => <tr key={p.label}><td>{p.label} to the club<span className="sub">Due {fmtDate(p.due)}</span></td><td>{money(p.amount)}</td></tr>)}
        {pr.fee > 0 && <tr><td>Change fee<span className="sub">{pr.feeNote}</span></td><td>{money(pr.fee)}</td></tr>}
        <tr className="total"><td>Your total commitment ({pr.currency})<span className="sub">Reimbursement + remaining payments + fees. No Handoff fee.</span></td><td>{money(commitment(ev, reimb, paid) + (topUp || 0))}</td></tr>
        {paidToDate(ev) > paid && <tr><td colSpan={2}><span className="sub" style={{ color: "var(--warn)" }}>A payment has come due since this was listed. Confirm the seller's current balance with the club.</span></td></tr>}
      </>}
    </tbody></table></div>
  );
}

/* The back button of an event, item or request page: to where it was opened from. From My activity, "My activity" reopens the card
   that opened it (origin.open, "type:id"; the overview when none). From another event, item or request page (linkFrom), that page's name
   goes back there, and that page keeps its own way back (origin.origin), so a round trip still ends at My activity. Otherwise the discovery
   view you came from (back: App's lastDisc, or Wanted for a request), its filters kept in App. Someone else's private alert is never named:
   after an account switch it reads as no origin. */
export function BackButton({ back, origin, go, s, me }) {
  const o = origin && typeof origin === "object" ? origin : null;
  const up = o && o.origin && typeof o.origin === "object" ? { origin: o.origin } : {}; // where that page itself goes back to
  const ev = o && o.name === "event" && Object.prototype.hasOwnProperty.call(EV, o.id) ? EV[o.id] : null;
  const it = o && o.name === "item" && s ? s.goods.find(x => x.id === o.id) || null : null;
  const rq = o && o.name === "iso" && s ? s.interests.find(x => x.id === o.id && (x.kind === "iso" || x.userId === me)) || null : null;
  const [label, to] = o && o.name === "activity" ? ["My activity", () => go("activity", typeof o.open === "string" && o.open ? { open: o.open } : {})]
    : ev ? [ev.title, () => go("event", { id: ev.id, ...up })]
    : it ? [it.title, () => go("item", { id: it.id, ...up })]
    : rq ? [rq.userId === me ? (rq.kind === "iso" ? "Your request" : "Your alert") : `${(PEOPLE[rq.userId] || { name: "A classmate" }).name}'s request`, () => go("iso", { id: rq.id, ...up })]
    : [VIEW_LABEL[back] || "Available", () => go(back || "explore")];
  return <button type="button" className="btn btn-ghost btn-sm back" onClick={to}><Icon name="back" size={15} />{label}</button>;
}

/* §9v item 3 (live): where a post lands, now that the shared market has no outward Share. One short line that says it worked ("Item
   posted.", "Request posted."; a ticket's "Ticket listed." is in its "Your listing" panel) and the one prominent next action, Done,
   which goes back to browsing. The record's ordinary URL is its link. data-posted: the line the checks read (as before, "Item posted."). */
export function PostedNote({ text, onDone }) {
  return (
    <div className="callout good posted-note" data-posted-note="">
      <p data-posted=""><Icon name="check" size={16} />{text}</p>
      <button type="button" id="posted-done" className="btn btn-primary" onClick={onDone}>Done</button>
    </div>
  );
}

/* Progress: done steps are ticked; the step in progress reads as what's being waited on ("Waiting for Jordan to accept"),
   so it isn't mistaken for a step that already happened. */
export function Timeline({ steps, done, nowLabel }) {
  return (
    <ol className="timeline" aria-label="Progress" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((t, i) => (
        <li key={t} className={"tl-step " + (i < done ? "done" : i === done ? "now" : "")} aria-current={i === done ? "step" : undefined}>
          <span className="tl-dot">{i < done ? <Icon name="check" size={12} /> : null}</span>{i === done && nowLabel ? nowLabel : t}<span className="sr">{i < done ? " (done)" : i === done ? " (in progress)" : " (to come)"}</span>
        </li>
      ))}
    </ol>
  );
}

/* Inline confirmation. It replaces the button that opened it, so it takes focus (on the safe choice). "Keep it" (or Escape) hands focus
   back to that button (returnTo, re-rendered by then). After confirming, focus goes to what's left of the card: its title link or
   "View…" button, the card itself, or the page heading. */
let confirmSeq = 0;
export function Confirm({ text, label, onYes, onNo, returnTo }) {
  const ref = useRef(null); const safe = useRef(null); const [id] = useState(() => "cf" + (++confirmSeq));
  useEffect(() => { if (safe.current) safe.current.focus(); }, []);
  const keep = () => { onNo(); setTimeout(() => { if (returnTo && returnTo.current) returnTo.current.focus(); }, 0); };
  const yes = () => {
    const host = ref.current && ref.current.closest(".req, .panel, .iso"); onYes();
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const live = host && document.contains(host);
      let t = live ? host.querySelector("h3 button, .actions .btn-ghost:not([disabled])") : null;
      if (!t && live) { host.setAttribute("tabindex", "-1"); t = host; }
      if (!t) t = demoQuery("[data-handoff-content] h1");
      if (t) t.focus();
    }, 0);
  };
  return <div ref={ref} className="confirm" role="alertdialog" aria-labelledby={id} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); keep(); } }}><span id={id}>{text}</span><div className="actions"><button className="btn btn-sm btn-danger" onClick={yes}>{label}</button><button ref={safe} className="btn btn-sm" onClick={keep}>Keep it</button></div></div>;
}
