// POST /api/chats/new — create a new chat session

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { repositories } from "@/lib/container";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();

  const body = await req.json().catch(() => ({})) as { title?: string };
  const title = body.title ?? "New chat";

  const chat = await repositories.chats.create({ userId: user.id, title });
  return NextResponse.json({ chat }, { status: 201 });
}
