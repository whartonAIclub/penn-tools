import { cookies } from "next/headers";

export const GOOGLE_STATE_COOKIE = "pp_google_oauth_state";
export const GOOGLE_RETURN_TO_COOKIE = "pp_google_oauth_return_to";
export const GOOGLE_ACCESS_COOKIE = "pp_google_access_token";
export const GOOGLE_REFRESH_COOKIE = "pp_google_refresh_token";
export const GOOGLE_EXPIRY_COOKIE = "pp_google_access_expires_at";

export function getBaseUrl(): string {
  return process.env["APP_BASE_URL"] ?? "http://localhost:3002";
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
  );
}

export async function getGoogleAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GOOGLE_ACCESS_COOKIE)?.value ?? null;
  const expiryRaw = cookieStore.get(GOOGLE_EXPIRY_COOKIE)?.value ?? null;

  if (!token || !expiryRaw) return token;

  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry)) return token;
  if (Date.now() >= expiry) return null;

  return token;
}

