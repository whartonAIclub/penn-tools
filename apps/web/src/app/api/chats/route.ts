// GET /api/chats  — list all chats for the current user
// POST /api/chats — handled in /api/chats/new/route.ts (kept separate for clarity)

import { NextResponse } from "next/server";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { repositories } from "@/lib/container";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();

  const chats = await repositories.chats.findAllByUser(user.id);
  return NextResponse.json({ chats });
}
