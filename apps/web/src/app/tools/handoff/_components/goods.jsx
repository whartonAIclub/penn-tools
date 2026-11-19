// Goods (moved unchanged from HandoffPrototype.jsx): an item's picture and cover (the seller's photos, or the preview's drawn sample
// pictures, ITEM_ART), its card (GoodsCard), its page (ItemPage), the seller's panel with the item's requests (ItemPanel), and a request
// to buy an item, from either side (GoodsReqCard, with gStatus). Sell an item (SellPage) stays in HandoffPrototype.jsx with the other
// posting forms. Imports: ui, requests and exchanges.
// Live only (EP-ui): the seller's Edit, Pause and Resume of their own item in ItemPanel (the edit form is exchanges.jsx's TermsForm), a
// paused item that can't be requested on its page, and the pending-request rule on a request's card while the item is paused
// (C-CONTRACT §8).
// Live only (forms round 2, §9j item 4): an item posted at an explicit $0 reads "Free" wherever its price shows (the engine's itemPrice
// and isFreePrice): its card, its page, the seller's panel and a request's card, which then ask for no payment (goodsRuleFor).
// Live only (follow-on B2): "Close item" in one inline step (exchanges.jsx's CloseStep), never while a buyer holds it (the engine's
// closeHeldWhy says why, beside the disabled button, and Pause is there meanwhile), then "Post again": Sell an item, filled in with it.
// Live only (§9q item 6): an item may state no category, condition or pickup area, and its last day is a "pickup by" date only where
// its seller chose one (the engine's hasPickupBy). Every line here says only what the item states (_lib/goods.js); an item that
// states everything, as each earlier one does, reads exactly as it did.
// Live only (§9s item 6): an item's one photo. Its view carries only a reference (pic: version and size); the picture comes from
// Handoff's own route (_lib/photo.js photoSrc), as a thumbnail on its card and larger on its page (ItemGallery, also on a signed-out
// visitor's item page). The seller adds, changes or removes it on their item's page (OwnPhoto) while it's open. The preview keeps its
// browser-only photos (photosOf).
import React, { useState, useEffect, useRef } from "react";
import {
  DAY, RULES, CLOCK, PEOPLE, atMs, fmtDate, fmtWhen, fmtMs, money, isoDate, ago, untilText, plural, checkOffer, isLive, GOODS_CATS,
  GFINAL, gState, itemOf, goodsRespondBy, reservedFor, itemState, goodsFits, photosOf, itemPaused, pickupOver, closeHeldWhy, itemPrice, isFreePrice, hasPickupBy, itemEndNote, dotJoin
} from "@penntools/tool-handoff/engine";
import { LIVE } from "../_lib/mode";
import { itemKind, itemWhere, itemOver, itemEnds, itemPanelWhere, itemMeet, itemWhereRow, itemOverWords, postAgainGoods } from "../_lib/goods";
import { demoElement, focusSoon } from "../_lib/dom";
import { photoSrc, shrinkPhoto } from "../_lib/photo";
import { linkFrom } from "../_lib/routes";
import { Icon, Avatar, StateBadge, BackButton, Timeline, Confirm, PostedNote, BoardBand, OwnTag } from "./ui";
import { itemLook } from "../_lib/look";
import { IsoCard } from "./requests";
import { ProblemBox, TermsForm, CloseStep, closedLine } from "./exchanges";

/* Demo product pictures for the seeded items: drawn, not photographed (labeled "Demo image" on the item page).
   Real listings use the seller's own photo (SellPage). Fixed colors on purpose: they stand in for photos. */
const ART_BG = (a, b) => <><defs><linearGradient id={"bg" + a.slice(1) + b.slice(1)} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs><rect width="240" height="160" fill={`url(#bg${a.slice(1)}${b.slice(1)})`} /><rect y="118" width="240" height="42" fill="#000" opacity=".06" /></>;
const ITEM_ART = {
  g1: <>{ART_BG("#efe7dc", "#e2d6c6")}<ellipse cx="120" cy="134" rx="92" ry="7" fill="#000" opacity=".12" /><rect x="38" y="58" width="164" height="44" rx="10" fill="#7d838c" /><rect x="30" y="74" width="22" height="50" rx="9" fill="#6c727b" /><rect x="188" y="74" width="22" height="50" rx="9" fill="#6c727b" /><rect x="48" y="94" width="144" height="26" rx="6" fill="#8d939b" /><rect x="50" y="94" width="68" height="20" rx="5" fill="#979da5" /><rect x="122" y="94" width="68" height="20" rx="5" fill="#979da5" /><rect x="60" y="66" width="34" height="24" rx="6" fill="#c9b79c" transform="rotate(-6 77 78)" /><rect x="40" y="122" width="6" height="10" fill="#3b3b3b" /><rect x="194" y="122" width="6" height="10" fill="#3b3b3b" /><rect x="52" y="116" width="136" height="5" rx="2" fill="#5d636b" /></>,
  g2: <>{ART_BG("#e8edf3", "#d7dfe8")}<ellipse cx="120" cy="134" rx="56" ry="5" fill="#000" opacity=".12" /><rect x="52" y="28" width="136" height="82" rx="6" fill="#1f2329" /><rect x="58" y="34" width="124" height="70" rx="2" fill="#3a6fb0" /><path d="M58 104 L120 50 L182 104 Z" fill="#5b8fd0" opacity=".55" /><circle cx="150" cy="54" r="10" fill="#f6d27a" opacity=".85" /><rect x="112" y="110" width="16" height="16" fill="#2a2e35" /><rect x="92" y="125" width="56" height="6" rx="3" fill="#2a2e35" /><path d="M188 98 C 205 104, 210 120, 196 130" stroke="#222" strokeWidth="3" fill="none" /></>,
  g3: <>{ART_BG("#ece9e4", "#dcd7cf")}<ellipse cx="120" cy="138" rx="96" ry="6" fill="#000" opacity=".12" /><rect x="40" y="40" width="6" height="94" fill="#2e2f33" /><rect x="194" y="40" width="6" height="94" fill="#2e2f33" /><rect x="40" y="40" width="160" height="6" fill="#2e2f33" /><rect x="40" y="70" width="160" height="5" fill="#2e2f33" />{[62, 84, 106, 128, 150, 172].map(x => <rect key={x} x={x} y="46" width="4" height="24" fill="#3c3e43" />)}<rect x="40" y="104" width="160" height="6" fill="#2e2f33" /><path d="M46 110 L194 110 L214 126 L26 126 Z" fill="#3c3e43" opacity=".9" /><rect x="22" y="126" width="6" height="10" fill="#2e2f33" /><rect x="212" y="126" width="6" height="10" fill="#2e2f33" /><rect x="96" y="114" width="48" height="10" rx="2" fill="#c8b79a" /></>,
  g4: <>{ART_BG("#f1ece4", "#e3dbcf")}<rect y="112" width="240" height="48" fill="#cdbfa8" /><ellipse cx="118" cy="122" rx="42" ry="6" fill="#000" opacity=".15" /><rect x="80" y="110" width="76" height="10" rx="4" fill="#2b2d31" /><path d="M86 112 L92 50 Q118 40 144 50 L150 112 Z" fill="#d9dde2" /><path d="M96 108 L100 56 Q110 52 116 52 L112 108 Z" fill="#fff" opacity=".55" /><path d="M146 58 Q172 62 168 84 Q166 100 148 102" stroke="#2b2d31" strokeWidth="9" fill="none" strokeLinecap="round" /><path d="M92 54 L76 46 L82 60 Z" fill="#c4c9cf" /><rect x="104" y="40" width="28" height="8" rx="4" fill="#2b2d31" /><circle cx="118" cy="98" r="3" fill="#3fb37f" /></>,
  g5: <>{ART_BG("#e7ecf2", "#d3dce6")}<ellipse cx="120" cy="140" rx="58" ry="5" fill="#000" opacity=".1" /><path d="M120 22 C 104 22, 98 30, 96 40 L66 52 L44 116 L60 122 L76 82 L78 134 L162 134 L164 82 L180 122 L196 116 L174 52 L144 40 C 142 30, 136 22, 120 22 Z" fill="#c2452f" /><path d="M96 40 C 100 30, 140 30, 144 40 C 136 48, 104 48, 96 40 Z" fill="#a8371f" /><rect x="118" y="44" width="4" height="90" fill="#2a2a2a" /><rect x="84" y="88" width="24" height="5" rx="2" fill="#a8371f" /><rect x="132" y="88" width="24" height="5" rx="2" fill="#a8371f" /><path d="M78 104 L162 104" stroke="#a8371f" strokeWidth="3" /></>,
  g6: <>{ART_BG("#eceef1", "#dadde2")}<ellipse cx="120" cy="140" rx="54" ry="5" fill="#000" opacity=".12" /><rect x="86" y="20" width="68" height="58" rx="14" fill="#2c3036" /><g opacity=".35" stroke="#7a828c" strokeWidth="1">{[30, 38, 46, 54, 62, 70].map(y => <line key={y} x1="92" y1={y} x2="148" y2={y} />)}</g><rect x="114" y="76" width="12" height="10" fill="#2c3036" /><rect x="76" y="86" width="88" height="16" rx="7" fill="#33373e" /><rect x="68" y="78" width="10" height="20" rx="3" fill="#24272c" /><rect x="162" y="78" width="10" height="20" rx="3" fill="#24272c" /><rect x="116" y="102" width="8" height="22" fill="#8c939c" /><path d="M120 124 L82 132 M120 124 L158 132 M120 124 L100 138 M120 124 L140 138 M120 124 L120 136" stroke="#24272c" strokeWidth="5" strokeLinecap="round" />{[[80, 134], [160, 134], [98, 140], [142, 140]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill="#111" />)}</>,
  g7: <>{ART_BG("#e9ebe6", "#d7dbd2")}<rect y="114" width="240" height="46" fill="#9aa39a" /><ellipse cx="120" cy="124" rx="90" ry="7" fill="#000" opacity=".15" />{[[44, 82], [134, 96]].map(([x, y], k) => <g key={k}><rect x={x} y={y + 8} width="66" height="8" rx="3" fill="#a9adb3" /><rect x={x - 4} y={y - 6} width="14" height="36" rx="3" fill="#1f2226" /><rect x={x + 8} y={y - 2} width="9" height="28" rx="2" fill="#2d3136" /><rect x={x + 56} y={y - 6} width="14" height="36" rx="3" fill="#1f2226" /><rect x={x + 49} y={y - 2} width="9" height="28" rx="2" fill="#2d3136" /></g>)}</>,
  g8: <>{ART_BG("#f2ede4", "#e5ddcf")}<rect y="112" width="240" height="48" fill="#b98f62" /><ellipse cx="120" cy="120" rx="64" ry="6" fill="#000" opacity=".15" /><path d="M66 44 L170 36 L178 108 L74 116 Z" fill="#1d4e7a" /><path d="M74 116 L178 108 L178 114 L76 122 Z" fill="#f4f1ea" /><path d="M66 44 L74 116 L76 122 L68 50 Z" fill="#163d61" /><rect x="88" y="58" width="64" height="7" rx="2" fill="#f2c14e" transform="rotate(-4 120 61)" /><rect x="90" y="72" width="46" height="4" rx="2" fill="#cfe0f0" transform="rotate(-4 113 74)" /><rect x="90" y="80" width="38" height="4" rx="2" fill="#cfe0f0" transform="rotate(-4 109 82)" /></>,
};
/* Live (§9s item 6): the address of an item's one photo, from its view's reference (null without one). The preview: its own photos. */
const livePic = it => LIVE ? photoSrc(it) : null;
const picsOf = it => { const u = livePic(it); return u ? [u] : photosOf(it); };
const hasPicture = it => !!(picsOf(it).length || ITEM_ART[it.id]);
/* A photo from the route: if it can't be had (the item ended a moment ago, say), nothing is drawn rather than a broken image. */
function RoutePhoto({ src, alt, w, h, lazy }) {
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [src]);
  return bad ? null : <img className="item-img" src={src} alt={alt} width={w} height={h} loading={lazy ? "lazy" : undefined} decoding="async" onError={() => setBad(true)} />;
}
function ItemPicture({ it, k = 0, counted, lazy }) { // counted: the item page's gallery, where "photo 2 of 4" means something; lazy: a card's thumbnail
  const ps = picsOf(it); const i = Math.min(k, ps.length - 1);
  const alt = counted && ps.length > 1 ? `Seller's photo ${i + 1} of ${ps.length}: ${it.title}` : `Seller's photo: ${it.title}`;
  if (ps.length && livePic(it)) return <RoutePhoto src={ps[0]} alt={alt} w={it.pic.w} h={it.pic.h} lazy={lazy} />;
  if (ps.length) return <img className="item-img" src={ps[i]} alt={alt} />;
  return <svg className="item-img" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Demo image: ${it.title}`}>{ITEM_ART[it.id]}</svg>;
}
export function ItemCover({ it, className, size = 48, children }) {
  const lk = LIVE ? itemLook(it.cat) : null; // §9x item 2 (live): without a photo, the picture the item's card wears (its category's icon, or the bag), so an item has one icon and colour on Available and on its own page
  const [icon, color] = lk ? [lk.icon, lk.color] : GOODS_CATS[it.cat] || GOODS_CATS.Other;
  // Live, "pic": the photo's 16:9 card shape, for a posted item and for Sell an item's "Students will see" card (its chosen photo, not yet posted).
  if (hasPicture(it)) return <div className={"cover photo " + (LIVE && picsOf(it).length ? "pic " : "") + (className || "")} style={{ "--c": color }} data-look={LIVE && picsOf(it).length ? "photo" : undefined} aria-hidden={children ? undefined : "true"}><ItemPicture it={it} lazy />{children}</div>;
  return <div className={"cover " + (className || "")} style={{ "--c": color }} data-look={lk ? "icon:" + lk.icon : undefined} aria-hidden={children ? undefined : "true"}><Icon name={icon} size={size} />{children}</div>;
}
/* An item's pictures, large: the item page's, and a signed-out visitor's item page (live: the one photo, whole, in its own shape between
   3:4 and 2:1). Nothing without a picture. */
export function ItemGallery({ it }) {
  const [k, setK] = useState(0); // which seller photo is shown large (the preview's several)
  if (!hasPicture(it)) return null;
  const ps = picsOf(it), live = !!livePic(it);
  const shape = live ? { aspectRatio: String(Math.min(2, Math.max(0.75, it.pic.w / it.pic.h))) } : undefined;
  return (
    <div className="item-gallery">
      <div className={"item-hero" + (live ? " fit" : "")} style={shape}><ItemPicture it={it} k={k} counted /><span className="cap" aria-hidden="true">{ps.length ? (ps.length > 1 ? `Seller's photo ${Math.min(k, ps.length - 1) + 1} of ${ps.length}` : "Seller's photo") : "Demo image"}</span></div>
      {ps.length > 1 && <div className="item-thumbs" role="group" aria-label="Photos">{ps.map((p, j) => <button key={j} type="button" className={j === k ? "on" : ""} aria-pressed={j === k} aria-label={`Show photo ${j + 1}`} onClick={() => setK(j)}><img src={p} alt="" /></button>)}</div>}
    </div>
  );
}
/* Live (§9s item 6): the seller's own photo controls on their open item's page: Add a photo, or Change photo and Remove photo. A chosen
   picture is resized and re-encoded here first (shrinkPhoto), then sent beside setItemPhoto; the server checks it again, and the old
   bytes go with the change. Refusals say why, right here. */
function OwnPhoto({ it, dispatch, flash }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const has = !!livePic(it);
  const pick = () => { setErr(""); if (input.current) input.current.click(); };
  const done = (r, focus) => { setBusy(""); if (r.error) { setErr(r.error); return; } if (r.toast && flash) flash(r.toast); focusSoon(focus); };
  const onPick = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    setErr(""); setBusy("Preparing your photo…");
    const out = await shrinkPhoto(f);
    if (out.error) { setBusy(""); setErr(out.error); return; }
    setBusy("Saving…");
    done(await dispatch({ type: "setItemPhoto", id: it.id }, true, { photo: out.data }), "gi-photo-change");
  };
  const remove = async () => { setErr(""); setBusy("Removing…"); done(await dispatch({ type: "removeItemPhoto", id: it.id }, true), "gi-photo-add"); };
  return (
    <div className="gi-photo" data-busy={busy ? "" : undefined}>
      <input ref={input} id="gi-photo-file" type="file" accept="image/*" className="sr" tabIndex={-1} aria-hidden="true" onChange={onPick} />
      {has ? <>
          <button type="button" id="gi-photo-change" className="linkish" aria-describedby="gi-photo-msg" disabled={!!busy} onClick={pick}>Change photo</button><span aria-hidden="true">·</span>
          <button type="button" id="gi-photo-remove" className="linkish" disabled={!!busy} onClick={remove}>Remove photo</button></>
        : <button type="button" id="gi-photo-add" className="btn btn-sm" aria-describedby="gi-photo-msg" disabled={!!busy} onClick={pick}><Icon name="camera" size={14} />Add a photo</button>}
      <span id="gi-photo-msg" className={err ? "err" : "help"} aria-live="polite">{busy || err}</span>
    </div>
  );
}
const oboLabel = x => x.minOffer ? `OBO · offers from ${money(x.minOffer)}` : "OBO · open to offers";
export const GOODS_RULE = { label: "Direct between students", tone: "muted", icon: "hand",
  desc: "Meet somewhere public and check the item before you pay. You pay the seller directly at pickup." };
/* The same rule for a free item (live: an explicit $0): there's nothing to pay. */
export const goodsRuleFor = it => isFreePrice(it.price) ? { ...GOODS_RULE, desc: "Meet somewhere public and check the item before you take it. It's free, so there's nothing to pay." } : GOODS_RULE;

/* §9v item 1 (live, SELL5-M4): an item's card on Available, signed in or signed out, and Sell an item's "Students will see" (preview),
   in the boards' one layout. The seller's photo leads when there is one (as a picture); otherwise the compact coloured header with the
   bag, the same picture a Goods request has on Wanted. The header names a state only when it isn't plain "Available" (every card on
   Available is), and "Yours" on your own. Then the name, what it is and where (each only if the item states it), its one date (a pickup-by
   date its seller chose), and the price, with who and when in the caption. No OBO tag: the price line says "or best offer". */
export function BoardGoodsCard({ it, st, mine = false, sub, onOpen, preview = false }) {
  const head = <>{st && st.key !== "available" && <StateBadge state={st} />}{mine && <OwnTag />}</>; // §9x item 3: the owner's small "Your listing" label, as on their ticket's card (it was "Yours")
  const what = dotJoin(itemKind(it), itemWhere(it));
  return (
    <article className="ecard bcard" onClick={preview ? undefined : onOpen} style={preview ? { cursor: "default" } : null} data-item={it.id} data-kind="goods" data-own={mine ? "" : undefined}>
      {hasPicture(it) ? <ItemCover it={it}>{head}</ItemCover> : <BoardBand look={itemLook(it.cat)}>{head}</BoardBand>}{/* §9x item 2: the seller's photo first, else the item's category icon (the bag when it has none of its own) */}
      <div className="ebody">
        <h3>{preview ? it.title : <button className="stretch" onClick={e => { e.stopPropagation(); onOpen(); }}>{it.title}</button>}</h3>
        {st && <span className="sr">{st.label}.</span>}
        {what && <span className="meta">{what}</span>}
        {hasPickupBy(it) && <span className="meta">Pickup by {fmtDate(it.until)}</span>}
        <span className="price-line"><span className="price"><b>{preview && it.noPrice ? "Your price" : itemPrice(it.price)}</b>{it.obo ? ` or best offer${it.minOffer ? ` (from ${money(it.minOffer)})` : ""}` : ""}</span>{sub && <span className="sub">{sub}</span>}</span>
      </div>
    </article>
  );
}
export function GoodsCard({ it, s, me, onOpen, preview }) {
  const st = itemState(s, it); const mine = it.sellerId === me;
  if (LIVE) return <BoardGoodsCard it={it} st={st} mine={mine} sub={`${PEOPLE[it.sellerId].name} · posted ${ago(it.createdAt)}`} onOpen={onOpen} preview={!!preview} />;
  return (
    <article className="ecard" onClick={preview ? undefined : onOpen} style={preview ? { cursor: "default" } : null} data-item={it.id}>
      <ItemCover it={it}><StateBadge state={st} />{mine ? <span className="tag2">Yours</span> : it.obo ? <span className="tag2">OBO</span> : null}</ItemCover>
      <div className="ebody">
        <h3>{preview ? it.title : <button className="stretch" onClick={e => { e.stopPropagation(); onOpen(); }}>{it.title}</button>}</h3>
        <span className="sr">{st.label}.</span>
        {itemKind(it) && <span className="meta">{itemKind(it)}</span>}
        {itemWhere(it) && <span className="meta">{itemWhere(it)}</span>}
        <span className="price-line"><span><b>{preview && it.noPrice ? "Your price" : itemPrice(it.price)}</b>{it.obo ? ` or best offer${it.minOffer ? ` (from ${money(it.minOffer)})` : ""}` : ""}</span><span className="sub">{PEOPLE[it.sellerId].name} · posted {ago(it.createdAt)}</span></span>
      </div>
    </article>
  );
}

export function ItemPage({ s, me, id, go, dispatch, openShare, flash, back = "explore", origin, resume, posted = false }) { // posted (§9s item 5, §9v item 3, live): Post item just made this item, so its page opens with "Item posted." and Done (back to browsing), the one prominent next action; back: the discovery view you came from (App's lastDisc); origin: see BackButton; resume: see below
  const it = s.goods.find(x => x.id === id);
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState("");
  const [msg, setMsg] = useState("");
  const [share, setShare] = useState(true); // agree up front to share contact details if accepted
  const formHead = useRef(null); const wasOpen = useRef(false);
  const focusForm = () => { if (formHead.current) { formHead.current.focus(); formHead.current.scrollIntoView({ block: "start", behavior: "smooth" }); } };
  // Opening moves focus to the form; closing returns it to your new request (after sending) or to the button that opened it.
  useEffect(() => { if (open) focusForm(); else if (wasOpen.current) { const t = demoElement("gi-mine") || demoElement("gi-open"); if (t) t.focus(); } wasOpen.current = open; }, [open]);
  useEffect(() => { wasOpen.current = false; setOpen(false); setOffer(""); setMsg(""); }, [me]); // a half-written request belongs to the account that started it
  // resume "request": back from sign-in, the request form opens again, as its button would (resumeRef, set below); nothing is sent.
  const resumeRef = useRef(null);
  useEffect(() => { if (resume === "request" && resumeRef.current) resumeRef.current(); }, []);
  if (!it) return <div className="wrap"><div className="page-head"><h1>Item not found</h1><p className="muted" style={{ marginTop: 8 }}>{LIVE ? "It may have been sold, withdrawn or taken down a while ago." : "It may have been posted in someone else's browser. Demo activity isn't shared between people."}</p><div className="actions" style={{ marginTop: 14 }}><button className="btn" onClick={() => go("goods")}>All goods</button></div></div></div>;
  const st = itemState(s, it); const mine = it.sellerId === me; const seller = PEOPLE[it.sellerId];
  const reqs = s.goodsReqs.filter(g => g.itemId === it.id);
  const myReq = reqs.find(g => g.buyerId === me && !GFINAL.includes(gState(g, it).st)) || reqs.find(g => g.buyerId === me && gState(g, it).st === "completed");
  // Live: a paused item can't be requested, not even as a backup to a hold agreed before the pause (C-CONTRACT §8).
  const paused = LIVE && itemPaused(it);
  // The development preview's Share (the page head's and the rail's, as ItemPanel's), not for a sold or withdrawn item or one whose pickup
  // window is over (readiness RC-2). The shared market has no outward Share (§9v item 3): an item's ordinary URL is its link.
  const shareable = !LIVE && !["sold", "withdrawn", "closed"].includes(st.key);
  const canReq = !mine && !myReq && ["available", "reserved"].includes(st.key) && !paused;
  const off = checkOffer(offer, it.price, it.obo, it.minOffer);
  const looking = s.interests.filter(i => isLive(i) && goodsFits(i, it));
  const pendingN = reqs.filter(g => gState(g, it).st === "pending").length;
  const ended = st.key === "sold" ? "This item has been sold." : st.key === "withdrawn" ? (LIVE ? "The seller closed this item." : "The seller withdrew this item.") : st.key === "closed" ? itemOverWords(it)
    : paused ? "The seller has paused this item, so it can't be requested right now." : null;
  const openForm = () => { setOpen(true); setOffer(""); setMsg(""); setShare(true); };
  resumeRef.current = () => { if (canReq) openForm(); };
  const goHere = linkFrom(go, { name: "item", id: it.id }, origin); // a request this item may fit comes back here, and this page keeps its own way back
  const free = isFreePrice(it.price), rule = goodsRuleFor(it); // live: posted at $0, so it reads "Free" and nothing is paid

  return (
    <div className="wrap">
      <BackButton back={back} origin={origin} go={go} s={s} me={me} />
      <div className="ev-top">
        <ItemCover it={it} className="thumb" size={34} />
        <div className="titleblock">
          <div className="tclub">{itemOver(it)}{LIVE ? "" : <> · <span>illustrative listing</span></>}</div>
          <h1>{it.title}</h1>
          <div className="ev-facts">
            {it.area && <span className="tline"><Icon name="pin" size={15} />Pickup in {it.area}</span>}
            <span className="tline"><Icon name="calendar" size={15} />{itemEnds(it)}</span>
          </div>
          <div className="chips" style={{ marginTop: 4 }}>
            <StateBadge state={st} />
            {it.obo && <span className="chip tone-accent">{oboLabel(it)}</span>}
          </div>
        </div>
        {shareable && <button className="btn btn-sm hide-sm" onClick={() => openShare({ type: "item", id: it.id })}><Icon name="share" size={14} />Share</button>}
      </div>

      <div className="ev-layout">
        <div>
          {LIVE && mine && posted && !ended && <PostedNote text="Item posted." onDone={() => go(back)} />}
          <ItemGallery it={it} />
          {LIVE && mine && !it.soldAt && !it.withdrawnAt && !pickupOver(it) && <OwnPhoto it={it} dispatch={dispatch} flash={flash} />}
          {it.note && <p className="ev-body" style={{ marginTop: hasPicture(it) ? 14 : 0 }}>“{it.note}”</p>}
          <section style={{ marginTop: 22 }}>
            <div className="section-head"><h2>Seller</h2></div>
            <div className="panel"><div className="listing" style={{ padding: 0, borderTop: 0 }}>
              <Avatar id={it.sellerId} size={34} />
              <div style={{ minWidth: 0 }}>
                <div className="who">{seller.name}{mine && <span className="chip tone-accent" style={{ marginLeft: 8 }}>You</span>}</div>
                <div className="note">Posted {ago(it.createdAt)}{!seller.demo ? " · fictional account" : ""}</div>
              </div>
              <div className="l-act" style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                <div className="ask">{free ? "Free" : <>{money(it.price)}<small>asking</small></>}</div>
                {canReq && !open && <button id="gi-open" className="btn btn-primary btn-sm" onClick={openForm}>{it.obo ? "Request or offer" : "Request"}</button>}
              </div>
            </div></div>
          </section>

          {mine && <section style={{ marginTop: 22 }}>
            <div className="section-head"><h2>Requests and offers</h2>{pendingN > 0 && <span className="chip tone-accent">{plural(pendingN, "waiting for your answer")}</span>}</div>
            <ItemPanel it={it} s={s} me={me} dispatch={dispatch} go={goHere} openShare={openShare} flash={flash} bare />
          </section>}

          {open && canReq && (
            <div className="panel" style={{ marginTop: 14, borderColor: "var(--accent)" }}>
              <div className="lhead"><h3 ref={formHead} tabIndex={-1} style={{ fontSize: 18 }}>{it.obo ? "Request or make an offer" : "Request this item"}</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close request form"><Icon name="x" size={16} /></button></div>
              <div className="form-stack" style={{ marginTop: 12 }}>
                {it.obo && <div className="field" style={{ maxWidth: 300 }}><label htmlFor="gi-offer">Your offer (optional)</label>
                  <div className="money"><span>$</span><input id="gi-offer" type="text" inputMode="decimal" value={offer} onChange={e => setOffer(e.target.value)} placeholder={`Asking ${it.price}`} aria-invalid={!!off.error} aria-describedby="gi-offer-msg" /></div>
                  <span id="gi-offer-msg" className={off.error ? "err" : "help"}>{off.error || `${seller.first} is open to offers below ${money(it.price)}${it.minOffer ? `, from ${money(it.minOffer)}` : ""}. One round: they accept or decline. Leave blank to pay the asking price.`}</span></div>}
                <div className="field"><label htmlFor="gi-msg">Note to {seller.first} (optional)</label>
                  <textarea id="gi-msg" value={msg} maxLength={280} onChange={e => setMsg(e.target.value)} placeholder="e.g. I can pick it up Saturday morning." /></div>
                <label className="check" htmlFor="gi-share"><input id="gi-share" type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} /><span>If {seller.first} accepts, share my contact details with them so we can arrange pickup.</span></label>
                <div className="callout"><b>What happens next</b>
                  <ol className="next-steps">
                    <li>{st.key === "reserved" ? `It's held for another buyer right now, so yours waits as a backup. If that falls through, ${seller.first} has ${RULES.sellerResponseHours} hours to accept yours.` : `${seller.first} has ${RULES.sellerResponseHours} hours to accept.`} If they do, it's held for you.</li>
                    <li>Agree a pickup time within {RULES.goodsHoldHours} hours (by {fmtDate(it.until)} at the latest), then {itemMeet(it)} and check the item.</li>
                    {free ? <li>It's free, so there's nothing to pay. Tap "I've picked it up" once you have it.</li>
                      : <li>Pay {seller.first} {off.isOffer ? money(off.price) : money(it.price)} directly and tap "I've picked it up".</li>}
                  </ol>
                </div>
                <div className="actions">
                  <button className="btn btn-primary" disabled={!!off.error} onClick={async () => { const r = await dispatch({ type: "requestItem", id: it.id, offer: off.isOffer ? offer : undefined, msg: msg.trim(), shareContact: share }); if (!r.error) setOpen(false); }}>{off.isOffer ? `Send offer of ${money(off.price)}` : free ? "Request it (free)" : `Request at ${money(it.price)}`}</button>
                  <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {!mine && myReq && <section style={{ marginTop: 22 }}>
            <div className="section-head"><h2 id="gi-mine" tabIndex={-1}>Your {myReq.isOffer ? "offer" : "request"}</h2></div>
            <GoodsReqCard g={myReq} role="buyer" s={s} dispatch={dispatch} />
          </section>}

          {mine && looking.length > 0 && <section style={{ marginTop: 22 }}>
            <div className="section-head"><h2>Classmates looking for something like this</h2></div>
            <div className="iso-grid" style={{ paddingBottom: 0 }}>{looking.map(i => <IsoCard key={i.id} i={i} s={s} go={goHere} compact />)}</div>
          </section>}
        </div>

        <aside className="rail">
          <div className="panel booking" style={{ display: "grid", gap: 14 }}>
            <div><div style={{ fontSize: 15 }}><b>{itemPrice(it.price)}</b>{it.obo ? " or best offer" : ""}</div><div className="muted" style={{ fontSize: 13 }}>{free ? "Nothing to pay at pickup" : it.obo ? (it.minOffer ? `Offers from ${money(it.minOffer)}` : "Open to offers below the asking price") : "Fixed price"}{LIVE ? "" : " · illustrative listing"}</div></div>
            {mine ? <div className="callout">This is your item.{paused ? " It's paused: classmates can't request it until you resume it." : ""}{pendingN ? ` ${plural(pendingN, "request")} waiting for your answer.` : ""}</div>
              : myReq ? <div className={"callout" + (gState(myReq, it).st === "completed" ? " good" : "")}>Your {myReq.isOffer ? "offer" : "request"}: <b>{gStatus(myReq, gState(myReq, it)).label}</b>.{paused && ["pending", "waiting"].includes(gState(myReq, it).st) ? " The seller has paused this item, so it can't be accepted until they resume it." : ""}</div>
              : canReq ? <>
                  {st.key === "reserved" && <p className="reason" style={{ marginTop: 0, color: "var(--warn)" }}>On hold for another buyer. You can still ask: yours waits as a backup and becomes active again if that falls through.</p>}
                  <button className="btn btn-primary" onClick={open ? focusForm : openForm}>{it.obo ? "Request or make an offer" : free ? "Request it (free)" : `Request at ${money(it.price)}`}</button>
                </>
              : <p className="reason" style={{ marginTop: 0 }}>{ended}</p>}
            <div className={"policy " + rule.tone}><Icon name={rule.icon} size={20} /><div><b>{rule.label}</b>{rule.desc}</div></div>
          </div>
          {shareable && <button className="btn btn-sm" onClick={() => openShare({ type: "item", id: it.id })}><Icon name="share" size={14} />Share this item</button>}
        </aside>
      </div>
    </div>
  );
}

/* A seller's item with its requests: on the item page and under My activity. Live: the seller's Edit, Pause and Resume (C-CONTRACT §8),
   as ListingPanel has them (exchanges.jsx): Edit and Pause while it can still be picked up (not sold, withdrawn or past its pickup-by
   date), Resume while it's paused (itemPaused). A pause with open requests asks first: they stay open with their deadlines (backups stay
   in line), but can't be accepted until it's resumed; a hold agreed before the pause goes on. An edit kept when the session ended
   (termsDraft, this item's; the edit form keeps it from the item page too) opens the form again on its card in My activity, once. */
export function ItemPanel({ it, s, me, dispatch, go, openShare, bare, flash, termsDraft }) {
  const [ask, setAsk] = useState(false); const opener = useRef(null);
  const st = itemState(s, it);
  const reqs = s.goodsReqs.filter(g => g.itemId === it.id);
  const openN = reqs.filter(g => !GFINAL.includes(gState(g, it).st)).length;
  const resv = reservedFor(s, it);
  const closed = ["sold", "withdrawn", "closed"].includes(st.key);
  const tag = "item:" + it.id;
  const [kept, setKept] = useState(() => LIVE && termsDraft && termsDraft.for === tag ? termsDraft : null);
  const [manage, setManage] = useState(() => kept ? "edit" : null); // "edit" (the form) or "pause" (its confirmation)
  const [said, setSaid] = useState(""); // the last refusal of Pause or Resume
  const pauseBtn = useRef(null);
  const idp = "ip-" + it.id;
  const own = LIVE && it.sellerId === me;
  const open = !it.soldAt && !it.withdrawnAt && !pickupOver(it);
  const paused = own && itemPaused(it);
  const canEdit = own && open, canPause = own && open && !it.pausedAt;
  useEffect(() => { if ((manage === "edit" && !canEdit) || (manage === "pause" && !canPause)) setManage(null); }, [manage, canEdit, canPause]); // a newer view closes what no longer applies
  const waiting = reqs.filter(g => ["pending", "waiting"].includes(gState(g, it).st)); // a pause keeps them open, unanswerable until it's resumed
  const pendingW = waiting.filter(g => gState(g, it).st === "pending").length, backupW = waiting.length - pendingW;
  const pauseOrResume = async type => {
    setSaid("");
    const r = await dispatch({ type, id: it.id }, true);
    setManage(null);
    if (r.error) { setSaid(r.error); focusSoon(idp + "-said"); return; }
    if (r.toast && flash) flash(r.toast);
    focusSoon(idp + (type === "pauseItem" ? "-resume" : "-pause"));
  };
  // The edit form's rule, as the server applies it: never below an open request made at the asking price, nor at or below an open offer.
  const undercut = p => waiting.filter(g => g.isOffer ? p <= g.price : p < g.price).sort((x, y) => y.price - x.price)[0] || null;
  const these = n => n === 1 ? "it" : "them";
  // Live (follow-on B2): "Close item" while it can still be picked up, in one step (CloseStep), never while a buyer holds it: closing doesn't
  // release a hold, so the button is disabled with the engine's words (closeHeldWhy: until when, and that Pause stops new requests now).
  // Closed, the card says so (with the reason, if given) and offers "Post again": Sell an item, filled in with this item (its pickup-by
  // date only while it's still ahead); focus goes there after closing. A refusal stays below the buttons, as Pause's does.
  const canClose = own && open;
  useEffect(() => { if (ask && own && !canClose) setAsk(false); }, [ask, own, canClose]); // a newer view (another tab, a sale) ends the step
  const closeIt = async reason => {
    setSaid("");
    const r = await dispatch({ type: "withdrawItem", id: it.id, ...(reason ? { reason } : {}) }, true);
    setAsk(false);
    if (r.error) { setSaid(r.error); focusSoon(idp + "-said"); return; }
    if (r.toast && flash) flash(r.toast);
    setTimeout(() => { const el = demoElement(idp + "-again") || demoElement(idp + "-closed"); if (el) el.focus(); }, 0);
  };
  const postAgain = () => go("sell", { ...(bare ? { from: "item", fromId: it.id } : { from: "activity" }), carry: { me, note: it.note || "", goods: postAgainGoods(it) } });
  return (
    <div className="panel" style={closed && !bare ? { background: "var(--surface-2)" } : null}>
      {!bare && <>
        <div className="lhead">
          <h3><button className="linkish" onClick={() => go("item", { id: it.id })}>{it.title}</button></h3>
          <span className={"chip tone-" + st.tone}>{st.label}</span>
        </div>
        <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{dotJoin("Goods", it.cat)} · {itemPrice(it.price)}{it.obo ? ` OBO${it.minOffer ? ` (offers from ${money(it.minOffer)})` : ""}` : ""} · {itemPanelWhere(it)} · posted {ago(it.createdAt)}</div>
      </>}
      {paused && <div className="callout warn" style={{ marginTop: bare ? 0 : 10, marginBottom: bare ? 12 : 0 }}><b>Paused.</b> Classmates can't request it until you resume it.{resv ? " The current hold continues." : ""}{pendingW ? ` ${pendingW === 1 ? "The open request stays" : `The ${pendingW} open requests stay`} open until ${pendingW === 1 ? "its deadline" : "their deadlines"}, but you can't accept ${these(pendingW)} until you resume it.` : ""}{backupW ? ` ${backupW === 1 ? "A backup request stays" : `${backupW} backup requests stay`} in line until you resume it.` : ""}</div>}
      {own && it.withdrawnAt && <div className="callout close-done" style={{ marginTop: bare ? 0 : 10, marginBottom: bare ? 12 : 0 }} data-closed={it.id}>
        <p id={idp + "-closed"} tabIndex={-1} style={{ margin: 0 }}><b>{closedLine(it)}.</b> Classmates can't request it any more.</p>
        <div className="actions" style={{ marginTop: 8 }}><button type="button" id={idp + "-again"} className="btn btn-sm" onClick={postAgain}>Post again</button></div>
      </div>}
      {reqs.length === 0 && !closed && <div className="muted" style={{ marginTop: bare ? 0 : 12, fontSize: 13.5 }}>{LIVE ? "No requests yet. Classmates with a matching request got an in-app alert." : "No requests yet. Classmates with a matching request got a simulated in-app alert."}</div>}
      {[...reqs].sort((a, b) => GFINAL.includes(gState(a, it).st) - GFINAL.includes(gState(b, it).st) || b.createdAt - a.createdAt).map(g => <GoodsReqCard key={g.id} g={g} role="seller" s={s} dispatch={dispatch} />)}
      {canEdit && manage === "edit" ? <TermsForm idp={idp + "-ed"} x={it} priceKey="price" hTag={bare ? "h3" : "h4"} title="Edit price and description"
          priceLabel="Price" priceHelp="Your price. Enter 0 to give it away." priceMissing="Enter a price, or 0 to give it away." capErr={() => null}
          openErr={p => { const g = undercut(p); return !g ? null : g.isOffer ? `There's an open offer of ${money(g.price)} on this item. Keep the price above ${money(g.price)}, or answer the offer first.` : `A classmate asked for this item at ${money(g.price)}. Keep the price at ${money(g.price)} or more, or answer their request first.`; }}
          oboOk oboHelp="You accept or decline each offer." noteLabel="Description (optional)" notePlaceholder="e.g. 2023 model, works well, charger included."
          nothing="Nothing changed: the item already has that price and description."
          keepNote="Changes apply from now on: requests and offers already made keep their prices. Classmates see the new terms on the item; no one is notified."
          onSave={async v => { const r = await dispatch({ type: "editItem", id: it.id, price: v.price, obo: v.obo, ...(v.minOffer !== undefined ? { minOffer: v.minOffer } : {}), ...(v.note !== undefined ? { note: v.note } : {}) }, true); if (!r.error && r.toast && flash) flash(r.toast); return r; }}
          place={{ name: "activity", open: tag }} tag={tag} draft={kept}
          onClose={() => { setKept(null); setManage(null); focusSoon(idp + "-edit"); }} />
        : manage === "pause" && canPause ? <div style={{ marginTop: 12 }}><Confirm text={`Pause this item? Classmates can't request it until you resume it.${pendingW ? ` ${pendingW === 1 ? "The open request stays" : `The ${pendingW} open requests stay`} open until ${pendingW === 1 ? "its deadline" : "their deadlines"}, but you can't accept ${these(pendingW)} meanwhile.` : ""}${backupW ? ` ${backupW === 1 ? "The backup request stays" : `The ${backupW} backup requests stay`} in line.` : ""} ${waiting.length === 1 ? "Its buyer is" : "Their buyers are"} told.`}
          label="Yes, pause" onYes={() => pauseOrResume("pauseItem")} onNo={() => setManage(null)} returnTo={pauseBtn} /></div>
        : !closed && (ask
        ? <div style={{ marginTop: 12 }}>{canClose
            ? <CloseStep idp={idp} what="item" onClose={closeIt} onKeep={() => setAsk(false)} returnTo={opener}
                text={`Close this item? Classmates can't request it any more.${openN ? ` ${openN === 1 ? "The open request is" : `The ${openN} open requests are`} declined.` : ""}`} />
            : <Confirm text={`Withdraw this item?${openN ? ` ${plural(openN, "open request")} will be declined.` : ""}`} label="Yes, withdraw" onYes={() => { dispatch({ type: "withdrawItem", id: it.id }); setAsk(false); }} onNo={() => setAsk(false)} returnTo={opener} />}</div>
        : <div className="actions" style={{ marginTop: 12 }}>
            {canEdit && <button id={idp + "-edit"} className="btn btn-sm" onClick={() => { setSaid(""); setManage("edit"); }}>Edit item</button>}
            {paused ? <button id={idp + "-resume"} className="btn btn-sm" onClick={() => pauseOrResume("resumeItem")}>Resume item</button>
              : canPause && <button ref={pauseBtn} id={idp + "-pause"} className="btn btn-sm" onClick={() => { setSaid(""); if (waiting.length) setManage("pause"); else pauseOrResume("pauseItem"); }}>Pause item</button>}
            {!paused && !LIVE && <button className="btn btn-sm" onClick={() => openShare({ type: "item", id: it.id })}><Icon name="share" size={14} />Share item</button>}{/* the preview only (§9v item 3) */}
            {own ? canClose && <>
                <button ref={opener} id={idp + "-close"} className="btn btn-sm btn-ghost btn-danger" disabled={!!resv} aria-describedby={resv ? idp + "-held" : undefined} onClick={() => { setSaid(""); setAsk(true); }}>Close item</button>
                {resv && <span id={idp + "-held"} className="muted" style={{ fontSize: 12.5 }}>{closeHeldWhy(it, resv)}</span>}</>
              : <>
                <button ref={opener} className="btn btn-sm btn-ghost btn-danger" disabled={!!resv} aria-describedby={resv ? "wd-" + it.id : undefined} onClick={() => setAsk(true)}>Withdraw item</button>
                {resv && <span id={"wd-" + it.id} className="muted" style={{ fontSize: 12.5 }}>On hold for {PEOPLE[resv.buyerId].first}: release it before withdrawing.</span>}</>}
          </div>)}
      {said && <p id={idp + "-said"} className="err" role="alert" tabIndex={-1} style={{ margin: "10px 0 0" }}>{said}</p>}
      {it.history && it.history.length > 0 && <details style={{ marginTop: 10 }}><summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>Item history</summary><ul className="history">{it.history.map((x, k) => <li key={k}>{fmtMs(x.at)} · {x.text}</li>)}</ul></details>}
    </div>
  );
}

const GSTATUS = {
  pending:   { label: "Waiting for the seller", tone: "accent" },
  waiting:   { label: "On hold · backup request", tone: "muted" },
  accepted:  { label: "Held · pickup next", tone: "warn" },
  completed: { label: "Picked up · sold", tone: "good" },
  declined:  { label: "Declined", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  released:  { label: "Released by seller", tone: "muted" },
  expired:   { label: "Expired", tone: "muted" },
};
export const gStatus = (g, e) => e.st === "completed" && g.receiptSimulated ? { label: "Picked up · simulated buyer", tone: "good" }
  : e.st === "pending" && g.isOffer ? { label: "Offer · waiting for the seller", tone: "accent" }
  : e.st === "waiting" && g.isOffer ? { label: "Offer on hold · backup", tone: "muted" } : GSTATUS[e.st];

export function GoodsReqCard({ g, role, s, dispatch, go }) {
  const [ask, setAsk] = useState(null); const opener = useRef(null); // the Release or Cancel button, for focus after "Keep it"
  const [pk, setPk] = useState(""); // pickup time being set
  const it = itemOf(s, g); const e = gState(g, it); const st = e.st;
  const seller = PEOPLE[it.sellerId], buyer = PEOPLE[g.buyerId];
  const other = role === "seller" ? g.buyerId : it.sellerId;
  const consent = g.consent || {};
  const resv = reservedFor(s, it); const blockedBy = st === "pending" && resv && resv.id !== g.id ? resv : null;
  const steps = ["Requested", role === "buyer" ? "Held for you" : `Held for ${buyer.first}`, "Picked up"]; const doneMap = { pending: 1, waiting: 1, accepted: 2, completed: 3 };
  const what = g.isOffer ? "offer" : "request";
  const free = isFreePrice(g.price); // live: asked for at $0 (the item was free), so it reads "Free" and nothing is paid
  const respondBy = goodsRespondBy(g, it);
  // Live: the seller has paused the item (C-CONTRACT §8). An open request stays open with its own deadline and a backup stays in line, but
  // nothing can be accepted until the seller resumes it: the seller can still decline, the buyer withdraw. A hold already agreed goes on.
  const paused = LIVE && itemPaused(it), waitsResume = paused && (st === "pending" || st === "waiting");
  let info = null;
  if (st === "waiting") info = {
    next: paused ? (role === "seller" ? `Nothing for now. ${buyer.first}'s ${what} stays in line while the item is paused.` : `${seller.first} paused the item, so your ${what} stays in line until they resume it.`)
      : role === "seller" ? `Nothing for now. If ${resv ? PEOPLE[resv.buyerId].first + "'s" : "the current"} hold falls through, ${buyer.first}'s ${what} becomes active again for you to accept or decline.` : `It's held for another buyer. If that falls through, your ${what} becomes active again and ${seller.first} can accept it.`,
    who: "No one yet: this is a backup", by: atMs(it.until), byNote: itemEndNote(it) };
  if (st === "pending") info = {
    next: blockedBy ? (role === "seller" ? `It's held for ${PEOPLE[blockedBy.buyerId].first}. Release that hold to accept this ${what}, or decline it.` : `It's held for another buyer. ${seller.first} can accept your ${what} if that falls through.`)
      : paused ? (role === "seller" ? `Resume the item to accept ${buyer.first}'s ${what}, or decline it` : `Wait for ${seller.first} to resume the item, or withdraw your ${what}`)
      : role === "seller" ? `Accept or decline ${buyer.first}'s ${what}` : `${seller.first} accepts or declines your ${what}`,
    who: `${seller.name} (seller)`, by: respondBy, byNote: LIVE ? "the seller's time to answer" : "seller response, demo rule" };
  if (st === "accepted") info = g.pickupAt
    ? { next: role === "buyer" ? `Pick it up, pay, then tap "I've picked it up"` : `Hand it over; ${buyer.first} confirms pickup`, who: `${buyer.name} (buyer)`, by: g.holdUntil || atMs(it.until), byNote: g.holdUntil && g.holdUntil < atMs(g.pickupAt) + DAY ? (hasPickupBy(it) ? "the hold ends with the item's pickup-by date" : "the hold ends when the listing expires") : "the hold ends a day after the pickup time" }
    : { next: "Agree a pickup time (either of you can set it below)", who: "Both of you", by: g.holdUntil || atMs(it.until), byNote: g.holdUntil ? (LIVE ? "agree a time by then, or the hold ends" : "agree a time by then, or the hold ends (demo rule)") : hasPickupBy(it) ? "pickup-by date" : "when the listing expires" };
  // What the in-progress step is waiting on, in the card's own words.
  const waitOn = st === "pending" && paused && !blockedBy ? (role === "seller" ? "Your turn: resume to accept, or decline" : "Paused by the seller")
    : st === "pending" ? (role === "seller" ? "Your turn: accept or decline" : `Waiting for ${seller.first} to accept`)
    : st === "waiting" ? "Backup: next in line"
    : st === "accepted" ? (!g.pickupAt ? "Agree a pickup time" : role === "buyer" ? "Your turn: pick it up" : `Waiting for ${buyer.first} to pick it up`) : null;

  return (
    <div className="req">
      <div className="req-top">
        <Avatar id={other} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{role === "seller" ? (free ? `${buyer.name} wants it (free)` : `${buyer.name} ${g.isOffer ? "offers" : "wants it at"} ${money(g.price)}`) : `${seller.name} · ${itemPrice(g.price)}${g.isOffer ? " offer" : ""}`}</b>
          <div className="muted" style={{ fontSize: 13 }}>{g.isOffer ? `Asking ${money(it.price)} · offered` : free ? "Free · requested" : "Asking price · requested"} {ago(g.createdAt)}</div>
        </div>
        <span className={"chip tone-" + gStatus(g, e).tone}>{gStatus(g, e).label}</span>
      </div>
      {g.msg && <div className="quote">“{g.msg}”</div>}
      {doneMap[st] != null && <Timeline steps={steps} done={doneMap[st]} nowLabel={waitOn} />}
      {e.reason && GFINAL.includes(st) && st !== "completed" && <div className="callout">{e.reason}</div>}
      {st === "pending" && g.restoredAt && <div className="callout">This was a backup. It's active again because the other buyer's hold fell through. {role === "seller" ? "You haven't accepted it yet." : `${seller.first} hasn't accepted it yet.`}</div>}
      {/* The pending-request rule, in words, while the seller has the item paused (C-CONTRACT §8); a backup's next step says it stays in line. */}
      {waitsResume && st === "pending" && <div className="callout warn">{role === "buyer"
        ? `${seller.first} paused this item. Your ${what} stays open until the deadline below, but ${seller.first} can't accept it until they resume the item. You can still withdraw it, and you'll get a notification when they resume it.`
        : `You paused this item. ${buyer.first}'s ${what} stays open until the deadline below, but you can't accept it until you resume the item. You can still decline it.`}</div>}
      {info && (
        <div className="next">
          <dl className="facts">
            <dt>Next step</dt><dd><b>{info.next}</b></dd>
            <dt>{st === "waiting" ? "Backup ends" : "Deadline"}</dt><dd>{fmtMs(info.by)} ({untilText(info.by)}) · {info.byNote}</dd>
            {st === "accepted" && <><dt>Where</dt><dd>{itemWhereRow(it)}</dd></>}
            {st === "accepted" && <><dt>Pickup time</dt><dd>{g.pickupAt ? <b>{fmtWhen(g.pickupAt)}</b> : "Not agreed yet"}</dd></>}
            {st === "accepted" && <><dt>Payment</dt><dd>{free ? "Nothing to pay: it's free." : <>{role === "buyer" ? `Pay ${seller.first} ${money(g.price)}` : `${buyer.first} pays you ${money(g.price)}`} directly at pickup. Handoff doesn't handle payment.</>}</dd></>}
          </dl>
          {st === "accepted" && <div className="actions" style={{ alignItems: "end" }}>
            <div className="field" style={{ maxWidth: 260 }}><label htmlFor={"pk-" + g.id}>{g.pickupAt ? "Change pickup time" : "Set a pickup time"}{LIVE ? " (ET)" : ""}</label>
              <input id={"pk-" + g.id} type="datetime-local" value={pk} min={isoDate(CLOCK) + "T00:00"} max={it.until + "T23:59"} onChange={e => setPk(e.target.value)} /></div>
            <button className="btn btn-sm" disabled={!pk} onClick={async () => { const r = await dispatch({ type: "setPickup", id: g.id, at: pk }); if (!r.error) setPk(""); }}>{g.pickupAt ? "Update" : "Set pickup time"}</button>
          </div>}
        </div>
      )}
      {st === "completed" && <div className="callout good"><b>{free ? "Picked up · free" : <>Picked up · sold for {money(g.price)}</>}</b>{g.receiptSimulated && <span className="chip tone-warn" style={{ marginLeft: 6 }}>Simulated: fictional buyer's confirmation</span>}<br />{role === "buyer" ? "You confirmed pickup." : `${buyer.first} confirmed pickup.`}</div>}

      {["accepted", "completed"].includes(st) && (
        <div className="next" style={{ background: "none", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="mail" size={16} /><b>Contact details</b></div>
          {consent.buyer && consent.seller
            ? <span>{seller.name}: <span className="num">{seller.contact || "not shared"}</span> · {buyer.name}: <span className="num">{buyer.contact || "not shared"}</span>{!LIVE && <> <span className="muted">(demo addresses)</span></>}</span>
            : <span className="muted">Shared only when both of you agree. {consent[role] ? `You agreed. Waiting for ${PEOPLE[other].first}.` : consent[role === "seller" ? "buyer" : "seller"] ? `${PEOPLE[other].first} agreed. Share yours to see each other's details.` : "Neither of you has shared yet."}</span>}
          {!LIVE && !PEOPLE[other].demo && consent[role === "seller" ? "buyer" : "seller"] && <span className="chip tone-warn" style={{ justifySelf: "start" }}>Simulated: {PEOPLE[other].first} is a fictional account that agrees automatically. Real participants choose for themselves.</span>}
          {!consent[role] && <div><button className="btn btn-sm" onClick={() => dispatch({ type: "itemConsent", id: g.id, side: role })}>Share my contact with {PEOPLE[other].first}</button></div>}
        </div>
      )}
      <ProblemBox x={g} kind="goods" role={role} other={other} dispatch={dispatch} done={st === "completed"} canReport={["accepted", "completed"].includes(st)} cancelHint={st === "accepted" ? (role === "buyer" ? "If it can't be fixed, cancel." : "If it can't be fixed, release it.") : ""} />

      {ask === "cancel" ? <Confirm text={st === "accepted" ? (paused ? "Cancel? The hold ends. The seller has paused the item, so it isn't back on sale until they resume it." : "Cancel? The hold ends and the item goes back on sale.") : st === "waiting" ? `Withdraw your backup ${what}? You won't be considered if the current hold falls through.` : `Withdraw your ${what}?`} label="Yes, cancel" onYes={() => { dispatch({ type: "cancelItemReq", id: g.id }); setAsk(null); }} onNo={() => setAsk(null)} returnTo={opener} />
        : ask === "release" ? <Confirm text={paused ? `Release the hold? ${buyer.first} loses it. The item stays paused until you resume it${s.goodsReqs.some(o => o.itemId === it.id && gState(o, it).st === "waiting") ? ", and backup requests stay in line until then" : ""}.`
          : `Release the hold? ${buyer.first} loses it and the item is available again.${s.goodsReqs.some(o => o.itemId === it.id && gState(o, it).st === "waiting") ? " Backup requests become active again for you to accept or decline." : ""}`} label="Yes, release" onYes={() => { dispatch({ type: "releaseItemReq", id: g.id }); setAsk(null); }} onNo={() => setAsk(null)} returnTo={opener} />
        : <div className="actions">
            {role === "seller" && st === "pending" && <>
              {/* While the item is paused, an open request can only be declined (C-CONTRACT §8). */}
              {!waitsResume && <button className="btn btn-primary btn-sm" disabled={!!blockedBy} onClick={() => dispatch({ type: "acceptItemReq", id: g.id, shareContact: true })}><Icon name="check" size={14} />{g.isOffer ? `Accept ${money(g.price)} · share my contact` : "Accept · share my contact"}</button>}
              <button className="btn btn-sm" onClick={() => dispatch({ type: "declineItemReq", id: g.id })}>Decline</button></>}
            {role === "seller" && st === "waiting" && <button className="btn btn-sm" onClick={() => dispatch({ type: "declineItemReq", id: g.id })}>Decline backup</button>}
            {role === "seller" && st === "accepted" && <button ref={opener} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk("release")}>Release hold</button>}
            {role === "buyer" && st === "accepted" && <button className="btn btn-primary btn-sm" onClick={() => dispatch({ type: "itemPickedUp", id: g.id })}><Icon name="check" size={14} />I've picked it up</button>}
            {role === "buyer" && ["pending", "waiting", "accepted"].includes(st) && <button ref={opener} className="btn btn-sm btn-ghost btn-danger" onClick={() => setAsk("cancel")}>{st === "waiting" ? "Withdraw backup" : st === "pending" ? (g.isOffer ? "Withdraw offer" : "Cancel request") : "Cancel"}</button>}
            {go && <button className="btn btn-ghost btn-sm" onClick={() => go("item", { id: it.id })}>View item</button>}
          </div>}
      {!LIVE && role === "seller" && st === "accepted" && !buyer.demo && (
        <div className="demo-ctl">
          <div className="eyebrow">Reviewer controls · fictional buyer</div>
          <div className="actions"><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "itemPickedUp", id: g.id, simulate: true })}>Simulate {buyer.first} confirming pickup</button></div>
        </div>
      )}
      {!LIVE && role === "buyer" && st === "pending" && !seller.demo && !blockedBy && (
        <div className="demo-ctl">
          <div className="eyebrow">Reviewer controls · fictional seller</div>
          <div className="actions"><button className="btn btn-sm btn-demo" onClick={() => dispatch({ type: "acceptItemReq", id: g.id, simulate: true })}>Simulate {seller.first} accepting</button></div>
        </div>
      )}
      {g.history && g.history.length > 0 && <details><summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>History</summary><ul className="history">{g.history.map((x, k) => <li key={k}>{fmtMs(x.at)} · {x.text}</li>)}</ul></details>}
    </div>
  );
}
