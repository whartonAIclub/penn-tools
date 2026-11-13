"use server";

// Server actions for the admin page's list of admins. Each checks that the
// caller is an admin (the page's check doesn't protect a server action) and
// returns the updated list. Admins can't remove themselves, so there is always
// at least one left.

import { revalidatePath } from "next/cache";
import type { Admin } from "@penntools/core/repositories";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { admins, logger } from "@/lib/container";
import { isPennEmail } from "@/lib/pennEmail";

export type AdminsResult = { admins: Admin[] } | { error: string };

async function currentAdmin(): Promise<{ email: string } | null> {
  const user = await getCurrentUser();
  return user?.email && (await isAdmin(user)) ? { email: user.email } : null;
}

export async function addAdmin(email: string): Promise<AdminsResult> {
  const admin = await currentAdmin();
  if (!admin) return { error: "Only admins can change who's an admin." };
  if (typeof email !== "string") return { error: "Invalid request." };

  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { error: "Enter an email address." };
  if (!isPennEmail(trimmed)) return { error: "Admins need a Penn (upenn.edu) email, since only Penn accounts can sign in." };

  await admins.add(trimmed, admin.email);
  logger.info("admin.added", { email: trimmed, by: admin.email });
  revalidatePath("/admin");
  return { admins: await admins.list() };
}

export async function removeAdmin(email: string): Promise<AdminsResult> {
  const admin = await currentAdmin();
  if (!admin) return { error: "Only admins can change who's an admin." };
  if (typeof email !== "string") return { error: "Invalid request." };
  if (email.toLowerCase() === admin.email.toLowerCase()) {
    return { error: "You can't remove yourself. Ask another admin to remove you." };
  }

  await admins.remove(email);
  logger.info("admin.removed", { email: email.toLowerCase(), by: admin.email });
  revalidatePath("/admin");
  return { admins: await admins.list() };
}
