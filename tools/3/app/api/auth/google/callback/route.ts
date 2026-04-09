import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_ACCESS_COOKIE,
  GOOGLE_EXPIRY_COOKIE,
  GOOGLE_REFRESH_COOKIE,
  GOOGLE_RETURN_TO_COOKIE,
  GOOGLE_STATE_COOKIE,
  getBaseUrl,
  isGoogleOAuthConfigured,
} from "@/lib/auth";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export async function GET(req: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/settings?error=google_not_configured", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?error=google_missing_code", req.url));
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_STATE_COOKIE)?.value;
  const returnTo = cookieStore.get(GOOGLE_RETURN_TO_COOKIE)?.value ?? "/settings";

  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(new URL("/settings?error=google_invalid_state", req.url));
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env["GOOGLE_CLIENT_ID"]!,
      client_secret: process.env["GOOGLE_CLIENT_SECRET"]!,
      redirect_uri: `${getBaseUrl()}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/settings?error=google_token_exchange_failed", req.url));
  }

  const tokens = (await tokenRes.json()) as GoogleTokenResponse;
  const response = NextResponse.redirect(new URL(returnTo, getBaseUrl()));
  const expiresAt = Date.now() + tokens.expires_in * 1000;

  response.cookies.set(GOOGLE_ACCESS_COOKIE, tokens.access_token, {
    httpOnly: true,
    path: "/",
    maxAge: tokens.expires_in,
  });
  response.cookies.set(GOOGLE_EXPIRY_COOKIE, String(expiresAt), {
    httpOnly: true,
    path: "/",
    maxAge: tokens.expires_in,
  });
  if (tokens.refresh_token) {
    response.cookies.set(GOOGLE_REFRESH_COOKIE, tokens.refresh_token, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  response.cookies.delete(GOOGLE_STATE_COOKIE);
  response.cookies.delete(GOOGLE_RETURN_TO_COOKIE);
  return response;
}

