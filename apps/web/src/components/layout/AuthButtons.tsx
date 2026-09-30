"use client";

import { signIn, signOut } from "next-auth/react";
import type { SignInProvider } from "@/lib/auth";
import styles from "./AuthButtons.module.css";

/**
 * Starts sign-in with the given provider (see signInProvider in lib/auth.ts)
 * and returns to the current page afterwards. Disabled when there is none.
 */
export function SignInButton({ provider }: { provider: SignInProvider | null }) {
  return (
    <button
      type="button"
      className={styles.signIn}
      onClick={() => provider && signIn(provider)}
      disabled={!provider}
      title={provider ? undefined : "Sign-in isn't configured on this server."}
    >
      Sign in
    </button>
  );
}

export function SignOutButton() {
  return (
    <button type="button" className={styles.signOut} onClick={() => signOut()}>
      Log out
    </button>
  );
}
