// The server's path for C4's tests (input, authorization, projection and seam): every client action goes through
// parseAction before the engine runs it, as store.ts does through the port (DEVIATIONS.md D9), and every view is projected
// inside withEngine at the world's time, then sent through JSON as the wire would. The people are labelled test accounts with
// made-up ids and @example.invalid emails; no database and no sign-in of any kind.
import * as E from "../../../engine/index.js";
import type { Action } from "../../../engine/index.js";
import { enginePort } from "../../engine-port.js";
import type { WorldDoc } from "../../engine-port.js";
import { parseAction } from "../../live.js";
import { PHOTO_NOT_HERE_ERROR } from "../../photo.js";
import type { PhotoRef } from "../../photo.js";
import { project, projectGuest } from "../../project.js";
import type { GuestView, PersonRow, View, ViewNotification, WorldId } from "../../types.js";
import { ANN, BOB, CAT, DAN, EVE, LiveTestWorld, type Outcome, type TestPerson } from "./worlds.js";

/** A sixth person who is party to nothing: the stranger whose view every canary test reads. */
export const FAY: TestPerson = { userId: "user-fay", name: "Fay Quinn", payHandle: "@fay-q" };
/** Someone with a profile and no records at all (J1-1: a first-time viewer is in their own view). */
export const GUS: TestPerson = { userId: "user-gus", name: "Gus Olsen", payHandle: "" };
export const PEOPLE6: readonly TestPerson[] = [ANN, BOB, CAT, DAN, EVE, FAY];

/** The email each test person's profile row carries (the engine never sees it; only the projection does). */
export const emailOf = (p: TestPerson): string => p.email ?? `${p.userId}@example.invalid`;

/** A refusal from parseAction, recorded as the store would answer it ("invalid"). */
export interface Invalid {
  actor: string;
  action: Action;
  error: string;
  why: string;
}

/**
 * LiveTestWorld on the server's path: a client's action (one with an actor) is parsed first, and the engine runs the parsed
 * action, never the raw one. An action parseAction refuses changes nothing; its error comes back as a refusal and is recorded
 * in `invalid`. The server's own sweep (no actor) isn't a client action and goes straight to the engine.
 */
export class ServerWorld extends LiveTestWorld {
  readonly invalid: Invalid[] = [];
  /**
   * §9s item 6: the reference of the image that comes beside the next client actions, or null. As in store.ts, it is attached after
   * parseAction (the port's attachPhoto), never read from the action; with an action that takes no photo, the action is refused.
   */
  photo: PhotoRef | null = null;

  override act(actor: string | null, action: Action): Outcome {
    if (actor === null) return super.act(actor, action);
    const parsed = parseAction(action);
    if (!parsed.ok) {
      this.invalid.push({ actor, action, error: parsed.error, why: parsed.why });
      return { res: { state: this.doc, error: parsed.error }, notes: [] };
    }
    if (!this.photo) return super.act(actor, parsed.action as Action);
    const withPic = enginePort.attachPhoto ? enginePort.attachPhoto(parsed.action, this.photo) : null;
    if (!withPic) {
      this.invalid.push({ actor, action, error: PHOTO_NOT_HERE_ERROR, why: "photo: this action takes none" });
      return { res: { state: this.doc, error: PHOTO_NOT_HERE_ERROR }, notes: [] };
    }
    return super.act(actor, withPic as Action);
  }

  /**
   * Lists on the server's path. Since protocol 2 a handle typed with a listing is dropped (parseAction) and buyers pay with the seller's
   * profile, so a seller with no way to be paid gets the handle these tests always typed for them ("@pay-me") on their profile instead,
   * as one saved before B1 (their exchanges copy it as "other", as before). A seller with a handle or methods keeps them.
   */
  override listTickets(actor: TestPerson, eventId: string, o: Parameters<LiveTestWorld["listTickets"]>[2] = {}): string {
    const me = this.people.find((p) => p.userId === actor.userId);
    if (me && !me.payHandle && !(me.payMethods && me.payMethods.length > 0)) {
      this.people = this.people.map((p) => (p.userId === actor.userId ? { ...p, payHandle: "@pay-me" } : p));
    }
    return super.listTickets(actor, eventId, o);
  }
}

export interface ViewOptions {
  /** Profile rows by id; default: every person in the world, plus the viewer, with emails. */
  people?: readonly TestPerson[];
  /** Leave these ids out of the profile rows (people whose rows are gone: "A classmate"). */
  withoutRows?: readonly string[];
  worldId?: WorldId;
  version?: number;
  /** The viewer's notifications as the store would read them; default: those the world drained for the viewer. */
  notifications?: ViewNotification[];
}

/** A profile row as store.ts reads it for a view (with the email): payMethods as readPeople reads them (follow-on B1). */
export const rowOf = (p: TestPerson): PersonRow => ({
  userId: p.userId, name: p.name, email: emailOf(p), payHandle: p.payHandle, payMethods: E.readPayMethods(p.payMethods ?? null, p.payHandle),
});

/**
 * The viewer's view of the world now, as store.ts's buildView makes it: the engine runs without anyone's email; the
 * projection gets every profile row with its email, the viewer's newest 100 notifications and the unread count.
 */
export function rawViewOf(w: LiveTestWorld, viewer: TestPerson, o: ViewOptions = {}): View {
  const people = new Map<string, PersonRow>();
  for (const p of [...(o.people ?? w.people), viewer]) if (!(o.withoutRows ?? []).includes(p.userId)) people.set(p.userId, rowOf(p));
  const notes = o.notifications ?? notificationsFor(w, viewer.userId);
  return E.withEngine({ doc: w.doc, people: [...people.values()].map((p) => ({ ...p, email: null })), now: w.now }, () =>
    project(w.doc as unknown as WorldDoc, viewer.userId, { // the store's opaque document type (engine-port.ts)
      worldId: o.worldId ?? "test-c4",
      version: o.version ?? w.outcomes.length,
      now: w.now,
      people,
      notifications: notes,
      unreadCount: notes.filter((n) => !n.read).length,
    }),
  );
}

/** rawViewOf, sent through JSON as it is to the browser. */
export function viewOf(w: LiveTestWorld, viewer: TestPerson, o: ViewOptions = {}): View {
  return JSON.parse(JSON.stringify(rawViewOf(w, viewer, o))) as View;
}

/**
 * The guest view of the world now (C-CONTRACT §7), as store.ts's getGuestView makes it: the engine runs with no one's profile
 * row, then the guest projection; sent through JSON as the wire would. `withPeople` runs it with every profile row installed
 * instead (the store never does): the allowlists alone must still keep every name out.
 */
export function guestViewOf(w: LiveTestWorld, o: { withPeople?: boolean; worldId?: WorldId; version?: number } = {}): GuestView {
  const people = o.withPeople ? w.people.map((p) => ({ ...rowOf(p), email: null })) : [];
  const raw = E.withEngine({ doc: w.doc, people, now: w.now }, () =>
    projectGuest(w.doc as unknown as WorldDoc, { worldId: o.worldId ?? "test-c4", version: o.version ?? w.outcomes.length, now: w.now }));
  return JSON.parse(JSON.stringify(raw)) as GuestView;
}

/** The notifications the world drained for one person, newest first, at most 100, as the store's query returns them. */
export function notificationsFor(w: LiveTestWorld, userId: string): ViewNotification[] {
  return w.notesFor(userId)
    .map((n) => ({ id: n.id, userId: n.userId, text: n.text, link: n.link ?? null, at: n.at, read: false }))
    .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1))
    .slice(0, 100);
}

/** Every string in a value (keys included), for canary scans. */
export function allText(value: unknown): string {
  return JSON.stringify(value);
}
