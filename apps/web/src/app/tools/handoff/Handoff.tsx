"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { signIn } from "next-auth/react";
import type { ActAnswer, ActInput, GuestView, View } from "@penntools/tool-handoff";
import type { SignInProvider } from "@/lib/auth";
import { act, deleteMyData, markRead, refresh, saveMyProfile } from "./actions";
import type { LiveApi } from "./_lib/live-link";
import { isSessionMessage, renders, startsConcealed } from "./_lib/confirm";

// The app reads the browser's URL (and, in the preview, its saved state) on its first render, so it mounts in the browser only.
const HandoffPrototype = dynamic(() => import("./HandoffPrototype"), {
  ssr: false,
  loading: () => <p role="status" style={{ padding: 24 }}>Loading Handoff…</p>,
});

// The development preview: the same app with the preview's kit (its sample data, self-tests and own pages: _preview/HandoffPreview.jsx),
// in a chunk of its own, so the live route never loads any of it.
const HandoffPreview = dynamic(() => import("./_preview/HandoffPreview"), {
  ssr: false,
  loading: () => <p role="status" style={{ padding: 24 }}>Loading Handoff…</p>,
});

/**
 * A change that carries a photo goes to the tool's act route (act/route.ts), which reads its body with a size cap; every other change
 * is the act server action (review of PR #88: no photo through a server action). The route answers what the server action would.
 */
async function actWithPhoto(input: ActInput): Promise<ActAnswer> {
  if (!input.photo) return act(input);
  const res = await fetch("/tools/handoff/act", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const answer: unknown = await res.json().catch(() => null);
  if (answer && typeof answer === "object" && "ok" in answer) return answer as ActAnswer;
  throw new Error(`Handoff: the act route answered ${res.status}.`); // like a lost server action: the link offers to try again
}

/**
 * The page's server actions, as the live app calls them (C-CONTRACT.md §1). A guest's page only refreshes (§7). Typed as the live link's
 * LiveApi (_lib/live-link.ts), so an action whose input or answer changes shape fails pnpm typecheck until the link follows it.
 */
const API: LiveApi = { act: actWithPhoto, refresh, markRead, saveMyProfile, deleteMyData };

type Props =
  /**
   * The normal route, signed in: the viewer's view from page.tsx, whether this server signs in with the local development provider, and the
   * id page.tsx gave this server render (a render already committed in this document came from Next's router cache, so the app conceals it
   * until the account is confirmed: conceal-fix, _lib/confirm.ts).
   */
  | { mode: "live"; initial: View; localSignIn: boolean; renderId?: string }
  /** The normal route, signed out: the guest view (C-CONTRACT.md §7), and the provider the platform's sign-in uses (null: none on this server). */
  | { mode: "guest"; initial: GuestView; signInProvider: SignInProvider | null }
  /** The development preview: the sample demo, saved in this browser. */
  | { mode?: "preview" };

/** Live, the app is keyed by the viewer (a guest's page by "guest"), so another account never inherits this one's screen. */
export function Handoff(props: Props) {
  useBrowserLayoutEffect(() => { committedHere = true; }, []); // Handoff has been committed in this document (startsConcealed)
  if (props.mode === "live") return <Live initial={props.initial} localSignIn={props.localSignIn} renderId={props.renderId ?? null} />;
  if (props.mode === "guest") {
    const provider = props.signInProvider;
    // The platform's own sign-in (next-auth, with the provider the site header's Sign in uses), coming back to callbackUrl: this page
    // and its place in the app, which the app builds from public ids only, never from anything typed.
    const startSignIn = provider ? (callbackUrl: string) => signIn(provider, { callbackUrl }) : null;
    return <HandoffPrototype key="guest" mode="live" initial={props.initial} api={API} localSignIn={provider === "dev"} signIn={startSignIn} />;
  }
  return <HandoffPreview />;
}

// Layout effects run in the browser; the server's HTML of this page has nothing to note.
const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
// True only while React hydrates the page's own HTML: a document load, whose render came with the document, made for its request.
const noSubscription = () => () => {};
const useHydrating = () => useSyncExternalStore(noSubscription, () => false, () => true);

// When this module ran (the document's performance clock): on a first visit, as Handoff's page code arrived. Only read here, never shared.
const CODE_RAN_AT = typeof performance === "undefined" ? Number.NaN : performance.now();
// Whether Handoff has been committed in this document yet (set once committed: Handoff's layout effect above).
let committedHere = false;

/**
 * Live, signed in. Whether the app starts concealed is decided here, where Next commits the page, not in the app, whose code arrives in a
 * chunk of its own (conceal-fix-2: the confirmation's CF-1). A render committed while "Loading Handoff…" showed, and left before the app
 * arrived, is known when Next's router cache brings it back; the first Handoff render in a document, unless it came with the document,
 * counts as fresh only when it comes as Handoff's code arrives (startsConcealed); and while the app's code is still loading, what would
 * make the app conceal (the tab hidden or shown, the back/forward cache, another tab's sign-out) makes it start concealed. A page that
 * loads in a tab hidden all along isn't held back: the app, once there, conceals and confirms when the tab is shown, as it always did. The
 * app asks (unconfirmed) as it first renders, and again once it's listening; it conceals, confirms and reloads as before
 * (_lib/live-link.ts).
 */
function Live({ initial, localSignIn, renderId }: { initial: View; localSignIn: boolean; renderId: string | null }) {
  const hydrating = useHydrating();
  // Decided as each render is first rendered, before this component notes it as committed (and again for a new render a refresh brings).
  const seen = useRef<{ id: string | null; doubt: boolean } | null>(null);
  if (!seen.current || seen.current.id !== renderId) {
    const sinceCodeRan = hydrating ? 0 : performance.now() - CODE_RAN_AT;
    const doubt = startsConcealed({ restored: renders.restored(renderId), hydrating, firstInDocument: !committedHere, sinceCodeRan });
    seen.current = { id: renderId, doubt };
  }
  useBrowserLayoutEffect(() => {
    renders.committed(renderId);
    const mine = seen.current;
    const doubt = () => { if (mine && mine.id === renderId) mine.doubt = true; };
    const onVisibility = () => doubt(); // hidden, or shown again: another tab may sign in as someone else meanwhile
    const onHide = (e: PageTransitionEvent) => { if (e.persisted) doubt(); };
    const onStorage = (e: StorageEvent) => { if (isSessionMessage(e.key, e.newValue)) doubt(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("storage", onStorage);
    };
  }, [renderId]);
  const unconfirmed = useCallback(() => !!seen.current && seen.current.doubt, []);
  return <HandoffPrototype key={initial.viewer.id} mode="live" initial={initial} api={API} localSignIn={localSignIn} unconfirmed={unconfirmed} />;
}
