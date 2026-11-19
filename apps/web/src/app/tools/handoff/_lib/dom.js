// DOM lookups for focus and sharing, inside Handoff's own root ([data-handoff-root]) only, so nothing else on the PennTools page
// (its header, its sidebar) ever matches.
export function demoRoot() {
  return document.querySelector("[data-handoff-root]");
}
export function demoQuery(selector) {
  return demoRoot()?.querySelector(selector) ?? null;
}
export function demoQueryAll(selector) {
  return demoRoot()?.querySelectorAll(selector) ?? [];
}
export function demoElement(id) {
  return demoQuery("#" + CSS.escape(id));
}
export const demoShareUrl = () => window.location.origin + window.location.pathname;
/* Where a dialog that renders through a portal goes (EventForm): the box App's content is in when it can be concealed (Keep, live and signed
   in; conceal-fix), so a dialog leaves the page with the content; elsewhere (the preview, a guest's page) the root. */
let layer = null;
export function setLayer(el) { layer = el; }
export function demoLayer() { return layer || demoRoot(); }
/* After a share or a withdrawal its row's buttons swap, so focus moves to the one that's there now. */
export const focusSoon = id => setTimeout(() => { const el = demoElement(id); if (el) el.focus(); }, 0);
