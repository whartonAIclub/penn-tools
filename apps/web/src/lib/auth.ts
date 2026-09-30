// ─────────────────────────────────────────────────────────────────────────────
// Authentication — SERVER ONLY
//
// Google sign-in via NextAuth (v4). Sessions are signed JWT cookies, so there
// are no session tables. Signing in upserts the `users` row for the Google
// account, and the session carries that row's id as `userId`.
//
// Signed-out visitors can browse, but have no user: getCurrentUser() returns
// null and APIs that need a user respond with signInRequired().
//
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, and in
// production NEXTAUTH_URL (the site's public URL). In development without
// Google credentials, "Sign in" logs in as a fixed local user instead.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers/index";
import type { User } from "@penntools/core/types";
import { repositories, logger } from "./container";

declare module "next-auth" {
  interface Session {
    /** Our `users` row id for the signed-in account. */
    userId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}

/** How the Sign in button signs in: Google, or (in development) a local user. */
export type SignInProvider = "google" | "dev";

/** The Google account id stored for the local development user. */
const DEV_GOOGLE_ID = "local-dev";

// Empty values count as unset (checked by truthiness): .env.example sets these to "".
const clientId = process.env["GOOGLE_CLIENT_ID"];
const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
const configuredSecret = process.env["NEXTAUTH_SECRET"];

/**
 * Google when fully configured; otherwise, in development only, a provider
 * that signs in as a fixed local user; otherwise none (sign-in disabled).
 * Returns the id separately because NextAuth only applies a custom id to a
 * credentials provider internally (the returned object's id is "credentials").
 */
function createSignInMethod(): { id: SignInProvider; provider: Provider } | null {
  if (clientId && clientSecret && configuredSecret) {
    return { id: "google", provider: GoogleProvider({ clientId, clientSecret }) };
  }
  if (process.env.NODE_ENV === "development") {
    console.warn("[PennTools] Google sign-in not configured — Sign in logs in as a local development user.");
    const provider = CredentialsProvider({
      id: "dev",
      name: "Local development",
      credentials: {},
      authorize: async () => ({ id: DEV_GOOGLE_ID, name: "Local Developer", email: "dev@localhost" }),
    });
    return { id: "dev", provider };
  }
  console.warn("[PennTools] GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or NEXTAUTH_SECRET not set — sign-in disabled.");
  return null;
}

const signInMethod = createSignInMethod();
const secret = configuredSecret || (signInMethod?.id === "dev" ? "penntools-local-dev" : undefined);

/** Which provider the Sign in button uses; null when sign-in is disabled. */
export const signInProvider = signInMethod?.id ?? null;

export const authOptions: NextAuthOptions = {
  ...(secret && { secret }),
  providers: signInMethod ? [signInMethod.provider] : [],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      // `account` is only present on the sign-in request itself.
      if (account) {
        const user = await repositories.users.upsertByGoogleAccount({
          googleId: account.provider === "google" ? account.providerAccountId : DEV_GOOGLE_ID,
          email: token.email ?? null,
          name: token.name ?? null,
          image: token.picture ?? null,
        });
        token.userId = user.id;
        logger.info("auth.sign_in", { userId: user.id });
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.userId = token.userId;
      return session;
    },
  },
};

/**
 * The signed-in user, or null when signed out. Also null if the session's
 * user no longer exists (e.g. after a database reset), so it reads as signed
 * out and signing in again recreates the user. Cached per request, so the
 * header and the page share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  // Read the request's cookies even when sign-in is unavailable, so Next.js
  // always renders callers per request instead of prerendering them signed out.
  cookies();
  if (!signInProvider) return null;

  const session = await getServerSession(authOptions);
  return session?.userId ? repositories.users.findById(session.userId) : null;
});

/** Response for APIs called without a signed-in user. */
export function signInRequired(): NextResponse {
  return NextResponse.json({ error: "Sign in required." }, { status: 401 });
}
