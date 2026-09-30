// Site-wide header: PennTools on the left; sign-in, or the profile icon (to
// account settings) and log out, on the right. Rendered by the root layout.

import Link from "next/link";
import { getCurrentUser, signInProvider } from "@/lib/auth";
import { SignInButton, SignOutButton } from "./AuthButtons";
import { ProfileAvatar } from "./ProfileAvatar";
import styles from "./SiteHeader.module.css";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        PennTools
      </Link>

      <div className={styles.actions}>
        {user ? (
          <>
            <Link href="/settings" className={styles.profile} aria-label="Account settings" title="Account settings">
              <ProfileAvatar name={user.name ?? user.email} image={user.image} />
            </Link>
            <SignOutButton />
          </>
        ) : (
          <SignInButton provider={signInProvider} />
        )}
      </div>
    </header>
  );
}
