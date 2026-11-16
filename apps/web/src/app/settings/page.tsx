// Account settings — reached from the profile icon in the site header.
// Signed-out visitors are asked to sign in.

import type { Metadata } from "next";
import { FREE_CREDIT_USD } from "@penntools/core/ai";
import { getCurrentUser } from "@/lib/auth";
import { freeCreditLeft, userApiKeys } from "@/lib/container";
import { SignOutButton } from "@/components/layout/AuthButtons";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { ProfileAvatar } from "@/components/layout/ProfileAvatar";
import cardPage from "@/components/layout/CardPage.module.css";
import { ApiKeys } from "./ApiKeys";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Account settings",
};

function usd(amount: number): string {
  if (amount > 0 && amount < 0.01) return "<$0.01";
  return `$${amount.toFixed(2)}`;
}

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return <SignInPrompt title="Account settings" message="Sign in to see and change your account settings." />;
  }

  const [savedKeys, creditLeft] = await Promise.all([userApiKeys.list(user.id), freeCreditLeft(user.id)]);

  return (
    <div className={cardPage.page}>
      <h1 className={cardPage.title}>Account settings</h1>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>Profile</h2>
        <div className={styles.profile}>
          <ProfileAvatar name={user.name ?? user.email} image={user.image} size={56} />
          <div>
            <p className={styles.name}>{user.name ?? "—"}</p>
            <p className={cardPage.muted}>{user.email ?? "—"}</p>
          </div>
        </div>
        <p className={cardPage.muted}>Your name, email and picture come from your Google account.</p>
      </section>

      {creditLeft !== null && (
        <section className={cardPage.card}>
          <h2 className={styles.heading}>Free AI credit</h2>
          <p>
            <span className={styles.creditLeft}>{usd(creditLeft)}</span> of {usd(FREE_CREDIT_USD)} left
          </p>
          <div
            className={styles.creditBar}
            role="progressbar"
            aria-label="Free AI credit left"
            aria-valuemin={0}
            aria-valuemax={FREE_CREDIT_USD}
            aria-valuenow={creditLeft}
            aria-valuetext={`${usd(creditLeft)} of ${usd(FREE_CREDIT_USD)} left`}
          >
            <div className={styles.creditFill} style={{ width: `${(creditLeft / FREE_CREDIT_USD) * 100}%` }} />
          </div>
          <p className={cardPage.muted}>
            PennTools pays for your first {usd(FREE_CREDIT_USD)} of AI use across its tools. After that, AskPenn and
            newer tools run on the API keys you save below; older tools ask for a key themselves. Each request sets
            aside its likely cost while it runs, so near the end a long request can need your own key even though some
            credit is left.
          </p>
        </section>
      )}

      <section className={cardPage.card}>
        <h2 className={styles.heading}>API keys</h2>
        <p className={cardPage.muted}>
          {creditLeft === null
            ? "AskPenn and newer tools run on the OpenAI and Anthropic API keys you save here; older tools ask for a key themselves."
            : "Your own OpenAI and Anthropic keys, used once your free credit runs out."}
        </p>
        <ApiKeys saved={savedKeys} />
        <p className={cardPage.muted}>After you save a key, only its last four characters are shown.</p>
      </section>

      <div>
        <SignOutButton />
      </div>
    </div>
  );
}
