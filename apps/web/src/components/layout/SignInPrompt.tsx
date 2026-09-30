// Shown in place of a page's content to signed-out visitors.

import { signInProvider } from "@/lib/auth";
import { SignInButton } from "./AuthButtons";
import styles from "./CardPage.module.css";

export function SignInPrompt({ title, message }: { title: string; message: string }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <section className={styles.card}>
        <p className={styles.muted}>{message}</p>
        <div>
          <SignInButton provider={signInProvider} />
        </div>
      </section>
    </div>
  );
}
