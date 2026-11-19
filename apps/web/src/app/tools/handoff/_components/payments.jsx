// How a seller is paid outside Handoff (follow-on Batch 1; C-CONTRACT §1-§3; live only: the preview keeps its sample handles). Imports:
// ui. Used by the Profile and the posting forms (HandoffPrototype.jsx) and by an exchange's card (exchanges.jsx).
// - The editor (PayMethodsEditor, with payEditorFrom, payEditorKept, payEditorErrors, payEditorMethods, payEditorDirty): one method, a
//   kind and its destination, with an optional second ("Add another method") and which of the two is preferred. Every value is checked
//   beside its field by the engine's checkPayMethods, the same check the server saves with, so its words are the server's.
//   §9q item 5: with nothing saved it opens on Venmo, its username field ready (payFocusId), and Zelle is the other choice; PayPal is
//   offered only to a person who saved it (payKindsOffered). Opening or cancelling saves nothing: the empty Venmo row is no method.
// - What people read: a saved list as one line (PaySummary), the kinds a seller takes for a buyer before committing (payKindsText,
//   payBeforeText), and an exchange's own copy as rows, each with Copy (PayRows).
// Nothing here assumes a provider: no method is chosen for you, a sign-in email is never filled in, and a handle saved before Batch 1
// (kind "other") is shown word for word, never given a provider's name.
import React, { useRef } from "react";
import { PAY_KINDS, PAY_NEW_KINDS, PAY_LABELS, NO_PAY_METHODS, checkPayMethods, formatPayMethod } from "@penntools/tool-handoff/engine";
import { demoElement } from "../_lib/dom";
import { Icon, onRadioKeys } from "./ui";

/* What each kind's field asks for, and its hint. */
const VALUE_LABEL = { venmo: "Venmo username", zelle: "Zelle email or US mobile number", paypal: "PayPal username or email" };
const VALUE_HELP = {
  venmo: "Your username, like @ann-lee.",
  zelle: "The email or US mobile number you enrolled with Zelle.",
  paypal: "Your PayPal username or email, as a buyer would enter it.",
};
const VALUE_HOLDER = { venmo: "@username", zelle: "Email or mobile number", paypal: "Username or email" };

const BLANK_ROW = () => ({ kind: "", value: "" });
/* §9q item 5: an editor with nothing in it opens on Venmo, with its username field there (EMPTY_ROW). pre: the kind was chosen for
   the person, not by them, so the row is still nothing: it saves nothing, isn't an error where a method is optional, and where one is
   needed its empty field says so. It stays nothing while it's empty, whichever kind is showing (switching to Zelle keeps pre). A
   method that was saved, or a second one being added, with a kind and no destination is said as before. */
const EMPTY_ROW = () => ({ kind: PAY_NEW_KINDS[0], value: "", pre: true });
const blank = r => !r.value.trim() && (!r.kind || r.pre === true);
/** The kinds this editor offers (§9q item 5): Venmo and Zelle, plus PayPal only for a person who saved it, or whose handle from
 *  before Batch 1 may be one (st.paypal, set from what's saved), or while a row is PayPal. PayPal is never offered as new. */
export const payKindsOffered = st => (st && (st.paypal === true || st.rows.some(r => r.kind === "paypal")) ? [...PAY_KINDS] : [...PAY_NEW_KINDS]);
/** The field that takes the focus as the editor opens: the first method's destination (an empty editor: the Venmo username); for a
 *  handle saved before Batch 1, which has no kind yet, the kind's first button. */
export const payFocusId = (idp, st) => (st && st.rows[0] && st.rows[0].kind ? `${idp}-v0` : `${idp}-k0-${PAY_KINDS[0]}`);
const key = ms => ms.map(m => m.kind + ":" + m.value).join("|");

/**
 * The editor's state from saved methods: { rows: 1-2 of { kind, value }, pref: the preferred row, touched: a row's field was left }. A
 * destination comes back as people read it ("@ann-lee", "(215) 555-0142"). A handle saved before Batch 1 ("other") comes back as a row
 * with no kind chosen, so the person says what it is; none saved, one empty row.
 */
export function payEditorFrom(methods) {
  const ms = (Array.isArray(methods) ? methods : []).slice(0, 2);
  const rows = ms.map(m => ({ kind: PAY_KINDS.includes(m.kind) ? m.kind : "", value: formatPayMethod(m) }));
  const paypal = ms.some(m => m.kind === "paypal" || m.kind === "other"); // kept for those who have it; not offered as new (payKindsOffered)
  return { rows: rows.length ? rows : [EMPTY_ROW()], pref: 0, touched: [false, false], ...(paypal ? { paypal: true } : {}) };
}
/** A kept editor (a Sell form kept when its session ended, or carried across the Tickets & trips | Goods switch), checked field by field. */
export function payEditorKept(o) {
  if (!o || typeof o !== "object" || !Array.isArray(o.rows) || o.rows.length < 1 || o.rows.length > 2) return null;
  const rows = o.rows.map(r => r && typeof r === "object" && (r.kind === "" || PAY_KINDS.includes(r.kind)) && typeof r.value === "string" ? { kind: r.kind, value: r.value.slice(0, 400), ...(r.pre === true && r.kind ? { pre: true } : {}) } : null);
  if (rows.some(r => !r)) return null;
  return { rows, pref: o.pref === 1 && rows.length === 2 ? 1 : 0, touched: [!!(o.touched && o.touched[0]), !!(o.touched && o.touched[1])], ...(o.paypal === true || rows.some(r => r.kind === "paypal") ? { paypal: true } : {}) };
}
/** What the editor saves, preferred first: an empty row is left out (none at all removes every method). */
export function payEditorMethods(st) {
  const rows = st.rows.filter(r => !blank(r));
  return (st.pref === 1 && rows.length === 2 ? [rows[1], rows[0]] : rows).map(r => ({ kind: r.kind, value: r.value }));
}
/**
 * What's wrong with each row, in the server's words (checkPayMethods), and where it goes: beside the kind ("Choose Venmo, Zelle or
 * PayPal.", "You've already added Venmo.") or beside the destination ("Venmo: enter your username, like @ann-lee."). now: said at once
 * (choosing a kind twice); the others wait for a try or for the field to be left. An empty row is fine; a form that needs a way to be paid
 * (required: a ticket listing, a held reply) asks for one in the engine's own words for that refusal.
 */
export function payEditorErrors(st, required = false) {
  const out = st.rows.map(r => {
    if (blank(r)) return null;
    if (!r.kind) return { at: "kind", error: checkPayMethods([{ kind: "", value: r.value }]).error };
    const c = checkPayMethods([{ kind: r.kind, value: r.value }]);
    return c.ok ? null : { at: "value", error: c.error };
  });
  // A kind chosen twice is said at once, beside the second, whatever its destination holds yet: the engine's words for two of a kind
  // (asked with two right values of that kind, so they're its words and nothing else's).
  const k = st.rows.length === 2 && st.rows[0].kind && st.rows[0].kind === st.rows[1].kind ? st.rows[0].kind : null;
  if (k) { const c = checkPayMethods([{ kind: k, value: SAMPLE[k] }, { kind: k, value: SAMPLE[k] }]); if (!c.ok) out[1] = { at: "kind", error: c.error, now: true }; }
  // Needed and nothing entered: an empty editor's Venmo field says so in the server's words for it (§9q item 5); with no kind
  // chosen (a row the person cleared), the engine's words for no method at all.
  if (required && st.rows.every(blank)) out[0] = st.rows[0].kind ? { at: "value", error: checkPayMethods([{ kind: st.rows[0].kind, value: "" }]).error } : { at: "kind", error: NO_PAY_METHODS };
  return out;
}
const SAMPLE = { venmo: "abcde", zelle: "a@b.co", paypal: "a" }; // a right value of each kind (for the words above only; never shown or sent)
/** Whether saving the editor would change the methods saved now (normalized, in order; a handle saved before Batch 1 counts as saved). */
export function payEditorDirty(st, saved) {
  const c = checkPayMethods(payEditorMethods(st));
  return !c.ok || key(c.methods) !== key(Array.isArray(saved) ? saved : []);
}
/** The field to focus for a row's problem: the destination, or the kind's chosen button (else its first). */
export const payErrorField = (idp, st, i, e) => e.at === "value" ? `${idp}-v${i}` : `${idp}-k${i}-${st.rows[i].kind || PAY_KINDS[0]}`;

/**
 * One or two ways to be paid. st and setSt: the editor's state (payEditorFrom), owned by the form, which also keeps it (a Sell form's
 * draft). errs: payEditorErrors(st). show: say every problem beside its field (after a try to save or post). canClear: a single method
 * can be removed too (Profile: removing every method). A kind's buttons are a radio group (arrow keys move and choose); choosing one
 * opens its field, with the focus in it.
 */
export function PayMethodsEditor({ idp, st, setSt, errs, show, canClear = false }) {
  const focusVal = useRef(-1); // a kind just chosen for a row whose field wasn't there: its field takes the focus
  const set = (i, patch) => setSt(o => ({ ...o, rows: o.rows.map((r, k) => k === i ? { ...r, ...patch } : r) }));
  const touch = i => setSt(o => o.touched[i] ? o : { ...o, touched: o.touched.map((t, k) => k === i ? true : t) });
  const focusFirst = (...ids) => setTimeout(() => { for (const id of ids) { const el = demoElement(id); if (el) { el.focus(); return; } } }, 0);
  const add = () => { setSt(o => ({ ...o, rows: [o.rows[0], BLANK_ROW()], touched: [o.touched[0], false] })); focusFirst(`${idp}-k1-${PAY_KINDS[0]}`); };
  const kinds = payKindsOffered(st); // Venmo and Zelle; PayPal only for a person who has it (§9q item 5)
  const remove = i => {
    setSt(o => { const rows = o.rows.filter((_, k) => k !== i); return { ...o, rows: rows.length ? rows : [EMPTY_ROW()], pref: 0, touched: [i === 0 ? o.touched[1] : o.touched[0], false] }; });
    focusFirst(`${idp}-add`, `${idp}-k0-${(st.rows[i === 0 ? 1 : 0] || {}).kind || PAY_KINDS[0]}`, `${idp}-k0-${PAY_KINDS[0]}`);
  };
  const both = st.rows.length === 2 && st.rows.every(r => r.kind);
  return (
    <div className="pay-edit" data-pay-editor={idp}>
      {st.rows.map((r, i) => {
        const e = errs[i], shown = !!e && (show || e.now || (e.at === "value" && st.touched[i]));
        const kindErr = shown && e.at === "kind" ? e.error : null, valErr = shown && e.at === "value" ? e.error : null;
        return (
          <div key={i} className="pay-row">
            <div className="field"><span className="label" id={`${idp}-k${i}-lbl`}>{i === 0 ? "How buyers pay you" : "Another way to pay you"}</span>
              <div className="pay-kind">
                <div className="seg" role="radiogroup" aria-labelledby={`${idp}-k${i}-lbl`} aria-describedby={kindErr ? `${idp}-k${i}-msg` : undefined} aria-invalid={kindErr ? true : undefined} onKeyDown={onRadioKeys}>
                  {kinds.map((k, n) => <button key={k} id={`${idp}-k${i}-${k}`} type="button" role="radio" aria-checked={r.kind === k} tabIndex={r.kind === k || (!r.kind && n === 0) ? 0 : -1} className={r.kind === k ? "on" : ""}
                    onClick={e => { if (r.kind !== k) { if (!r.value && (!r.kind || e.detail > 0)) focusVal.current = i; set(i, { kind: k }); } }}>{PAY_LABELS[k]}</button>)}
                </div>
                {(st.rows.length === 2 || (canClear && !blank(r))) && <button type="button" className="btn btn-sm btn-ghost" id={`${idp}-rm${i}`} onClick={() => remove(i)} aria-label={r.kind ? `Remove ${PAY_LABELS[r.kind]}` : "Remove this method"}>Remove</button>}
              </div>
              {kindErr && <span id={`${idp}-k${i}-msg`} className="err">{kindErr}</span>}</div>
            {(r.kind || r.value) && <div className="field pay-value"><label htmlFor={`${idp}-v${i}`}>{r.kind ? VALUE_LABEL[r.kind] : "Where buyers pay you"}</label>
              <input id={`${idp}-v${i}`} data-pay-value={r.kind || ""} ref={el => { if (el && focusVal.current === i) { focusVal.current = -1; el.focus(); } }} type="text" autoComplete="off" spellCheck={false} maxLength={260}
                value={r.value} placeholder={r.kind ? VALUE_HOLDER[r.kind] : ""} onChange={ev => set(i, { value: ev.target.value })} onBlur={() => { if (r.value.trim()) touch(i); }}
                aria-invalid={!!valErr} aria-describedby={`${idp}-v${i}-msg`} />
              <span id={`${idp}-v${i}-msg`} className={valErr ? "err" : "help"}>{valErr || (r.kind ? VALUE_HELP[r.kind] : "Saved before Handoff asked which app: choose Venmo, Zelle or PayPal above.")}</span></div>}
          </div>);
      })}
      {both && <fieldset className="pay-pref"><legend>Preferred method</legend>
        <div className="actions">{st.rows.map((r, i) => <label key={i} className="check" htmlFor={`${idp}-pref${i}`}><input id={`${idp}-pref${i}`} type="radio" name={`${idp}-pref`} checked={st.pref === i} onChange={() => setSt(o => ({ ...o, pref: i }))} /><span>{PAY_LABELS[r.kind]}</span></label>)}</div></fieldset>}
      {st.rows.length === 1 && st.rows[0].kind && !blank(st.rows[0]) && <div><button type="button" id={`${idp}-add`} className="linkish pay-add" onClick={add}><Icon name="plus" size={14} />Add another method</button></div>}
    </div>
  );
}

/** A saved list as one line: "Buyers pay you with Venmo @ann-lee (preferred) or Zelle (215) 555-0142"; a handle saved before Batch 1 as
 *  "Payment details: @ann", word for word. onChange: its Change, which opens the editor. */
export function PaySummary({ methods, onChange, idp, lead = "Buyers pay you with" }) {
  const legacy = methods.length > 0 && methods.every(m => m.kind === "other");
  return (
    <p className="pay-sum" id={idp + "-sum"}>
      {legacy ? <>{PAY_LABELS.other}: <b className="num">{methods[0].value}</b></>
        : <>{lead} {methods.map((m, k) => <React.Fragment key={m.kind}>{k ? " or " : ""}<b>{PAY_LABELS[m.kind]} <span className="num">{formatPayMethod(m)}</span></b>{k === 0 && methods.length > 1 ? " (preferred)" : ""}</React.Fragment>)}</>}
      {onChange && <> · <button type="button" id={idp + "-change"} className="linkish pay-change" aria-label="Change payment methods" onClick={onChange}>Change</button></>}
    </p>
  );
}

/** The kinds a seller takes, for a buyer before committing: "Venmo or Zelle"; null for a handle saved before Batch 1, or none. */
export function payKindsText(kinds) {
  const k = (Array.isArray(kinds) ? kinds : []).filter(x => PAY_KINDS.includes(x)).map(x => PAY_LABELS[x]);
  return k.length ? k.join(" or ") : null;
}
/** The reserve and offer forms' line (S: the seller's first name): kinds only, never where to pay. */
export function payBeforeText(l, S) {
  const k = payKindsText(l && l.payKinds);
  return k ? `Pay with ${k}. You'll see where to send it once it's reserved for you.` : `Pay ${S} directly. You'll see their payment details once it's reserved for you.`;
}
/**
 * A seller's own listing card (live): the handle its "· paid to …" names, as the engine's snapPay copies one into each new reservation. A
 * listing's own handle (one posted before Batch 1) is used only while its seller has no saved methods (methods: the viewer's own); with
 * methods saved, new reservations copy those, so the card names none (W1 fix, OBS-1). null for a listing without a handle of its own.
 */
export function listingPaidTo(l, methods) {
  if (!l || typeof l.payHandle !== "string" || !l.payHandle.trim()) return null;
  return Array.isArray(methods) && methods.length ? null : l.payHandle;
}

/**
 * An exchange's payment rows (inside a facts list): each method's kind and destination, as copied when it was reserved, with Copy when
 * copy is given (the buyer's). A handle from before Batch 1 is "Payment details from Ann", word for word (from: the seller's first name;
 * none on the seller's own card). Copy copies the destination exactly as shown.
 */
export function PayRows({ pay, from, copy, copyLbl }) {
  return pay.map(m => {
    const shown = formatPayMethod(m), k = "pay-" + m.kind, label = m.kind === "other" ? (from ? `Payment details from ${from}` : PAY_LABELS.other) : PAY_LABELS[m.kind];
    return (
      <React.Fragment key={m.kind}><dt>{label}</dt>
        <dd><span className="num pay-dest">{shown}</span>{copy && <> <button type="button" className="btn btn-sm pay-copy" data-copy={k} onClick={() => copy(k, shown)}><Icon name="copy" size={14} />{copyLbl(k, "Copy")}<span className="sr"> {m.kind === "other" ? "payment details" : PAY_LABELS[m.kind]}</span></button></>}</dd>
      </React.Fragment>);
  });
}
/** An amount as a payment app takes it: digits only ("70", "70.50"). */
export const amountDigits = n => Number.isInteger(n) ? String(n) : n.toFixed(2);
