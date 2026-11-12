"use server";

// Removing a saved syllabus or weekend, and saving, answering and removing
// events. Uploading a file goes through syllabus/route.ts, extract/route.ts
// or events/route.ts instead, since a file can be larger than server actions
// accept.

import {
  Event,
  EventError,
  addEvents,
  deleteEvent,
  deleteSyllabus,
  deleteWeekend,
  setRsvp,
  type RSVP,
  type SavedEvent,
} from "@penntools/tool-wemba-sync";
import { z } from "@penntools/core/ai";
import { getCurrentUser } from "@/lib/auth";
import { STORAGE_UNAVAILABLE, db } from "./db";

/** Deletes the signed-in student's syllabus; an error message if it couldn't be. */
export async function removeSyllabus(id: string): Promise<{ error: string } | null> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in with the button at the top right." };
  const sql = db();
  if (!sql || typeof id !== "string") return { error: STORAGE_UNAVAILABLE };
  try {
    return (await deleteSyllabus(sql, user.id, id)) ? null : { error: "That syllabus was already removed." };
  } catch (error) {
    console.error("[wemba-sync] removing a syllabus failed", error);
    return { error: STORAGE_UNAVAILABLE };
  }
}

/** Deletes the signed-in student's saved weekend; an error message if it couldn't be. */
export async function removeWeekend(id: string): Promise<{ error: string } | null> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in with the button at the top right." };
  const sql = db();
  if (!sql || typeof id !== "string") return { error: STORAGE_UNAVAILABLE };
  try {
    return (await deleteWeekend(sql, user.id, id)) ? null : { error: "That weekend was already removed." };
  } catch (error) {
    console.error("[wemba-sync] removing a weekend failed", error);
    return { error: STORAGE_UNAVAILABLE };
  }
}

/** Saves the events the student checked; the saved events, or an error message. */
export async function saveEvents(events: Event[]): Promise<{ saved: SavedEvent[] } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in with the button at the top right." };
  // From the browser, so checked here; addEvents checks each event's fields.
  const parsed = z.array(Event).min(1).max(20).safeParse(events);
  if (!parsed.success) return { error: "Those events couldn't be saved. Check their details and try again." };
  const sql = db();
  if (!sql) return { error: STORAGE_UNAVAILABLE };
  try {
    return { saved: await addEvents(sql, user.id, parsed.data) };
  } catch (error) {
    if (error instanceof EventError) return { error: error.message };
    console.error("[wemba-sync] saving events failed", error);
    return { error: STORAGE_UNAVAILABLE };
  }
}

/** Records the student's answer to an event (null clears it); an error message if it couldn't be. */
export async function answerEvent(id: string, rsvp: RSVP | null): Promise<{ error: string } | null> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in with the button at the top right." };
  const sql = db();
  if (!sql || typeof id !== "string") return { error: STORAGE_UNAVAILABLE };
  try {
    return (await setRsvp(sql, user.id, id, rsvp)) ? null : { error: "That event was removed." };
  } catch (error) {
    console.error("[wemba-sync] answering an event failed", error);
    return { error: STORAGE_UNAVAILABLE };
  }
}

/** Deletes the signed-in student's event; an error message if it couldn't be. */
export async function removeEvent(id: string): Promise<{ error: string } | null> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in with the button at the top right." };
  const sql = db();
  if (!sql || typeof id !== "string") return { error: STORAGE_UNAVAILABLE };
  try {
    return (await deleteEvent(sql, user.id, id)) ? null : { error: "That event was already removed." };
  } catch (error) {
    console.error("[wemba-sync] removing an event failed", error);
    return { error: STORAGE_UNAVAILABLE };
  }
}
