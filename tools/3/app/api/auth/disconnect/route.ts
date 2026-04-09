import { NextResponse } from "next/server";
import {
  GOOGLE_ACCESS_COOKIE,
  GOOGLE_EXPIRY_COOKIE,
  GOOGLE_REFRESH_COOKIE,
} from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(GOOGLE_ACCESS_COOKIE);
  response.cookies.delete(GOOGLE_REFRESH_COOKIE);
  response.cookies.delete(GOOGLE_EXPIRY_COOKIE);
  return response;
}

