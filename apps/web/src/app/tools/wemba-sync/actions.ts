"use server";

// Removing a saved syllabus or weekend. Uploading one goes through
// syllabus/route.ts or extract/route.ts instead, since a file can be larger
// than server actions accept.

import { deleteSyllabus, deleteWeekend } from "@penntools/tool-wemba-sync";
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
