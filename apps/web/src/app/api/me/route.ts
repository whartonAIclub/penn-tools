// GET /api/me — returns the signed-in user's profile
//
// Used by the frontend to display user info. Returns 401 when signed out.

import { NextResponse } from "next/server";
import { getCurrentUser, signInRequired } from "@/lib/auth";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    pennId: user.pennId,
  });
}
