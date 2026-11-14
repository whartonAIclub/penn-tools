// Shown in place of a tool's content when it runs on the AI API and the user
// can't call any provider: they've used their free AI credit and haven't saved
// a key. page.tsx returns it when `ai.providers()` is empty. The matching
// screen for signed-out visitors is SignInPrompt.

import Link from "next/link";
import { FREE_CREDIT_USD } from "@penntools/core/ai";
import styles from "./CardPage.module.css";

export function ApiKeyPrompt({ title }: { title: string }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <section className={styles.card}>
        <p className={styles.muted}>
          PennTools covers the first ${FREE_CREDIT_USD.toFixed(2)} of AI use for everyone; after that, tools run on
          your own AI API key. Add an OpenAI or Anthropic key in{" "}
          <Link href="/settings" className={styles.link}>
            Settings
          </Link>{" "}
          to keep using {title}.
        </p>
      </section>
    </div>
  );
}
