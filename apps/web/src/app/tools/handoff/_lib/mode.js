// Which Handoff is showing (C-DESIGN §4.7, §6.3; C-CONTRACT.md §7). App sets both as it renders (setMode), before anything below it
// reads them:
// - LIVE: the normal route, the shared market (the server sends the view, every change goes through its act action), rather than the
//   development preview's sample demo.
// - GUEST: on the normal route, a signed-out visitor's read-only guest view.
// Import them and read them where they're used: an import is a live binding, so every read sees App's latest call. A copy taken when a
// module loads (const live = LIVE) would stay false.
export let LIVE = false; // set by App as it renders: true on the normal route; the pages read it for wording and preview-only controls
export let GUEST = false;
export function setMode(live, guest) { LIVE = live; GUEST = guest; }
