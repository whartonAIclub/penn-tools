import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_RETURN_TO_COOKIE,
  GOOGLE_STATE_COOKIE,
  getBaseUrl,
  isGoogleOAuthConfigured,
} from "@/lib/auth";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export async function GET(req: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured on this environment." },
      { status: 400 }
    );
  }

  const state = crypto.randomUUID();
  const returnTo =
    req.nextUrl.searchParams.get("returnTo") ?? "/settings?connected=google";
  const baseUrl = getBaseUrl();
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env["GOOGLE_CLIENT_ID"]!);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set(GOOGLE_RETURN_TO_COOKIE, returnTo, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}

