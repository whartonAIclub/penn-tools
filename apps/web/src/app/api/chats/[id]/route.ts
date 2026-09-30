// GET /api/chats/:id — fetch a single chat with its messages

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { repositories } from "@/lib/container";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return signInRequired();

  const chat = await repositories.chats.findById(id);
  if (!chat || chat.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await repositories.messages.findByChatId(id);
  return NextResponse.json({ chat, messages });
}
