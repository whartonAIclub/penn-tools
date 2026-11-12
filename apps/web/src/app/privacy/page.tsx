// Privacy policy — linked from the dashboard footer and from the Google OAuth
// consent screen, whose verification needs it public, on penntools.org, and
// accurate about every Google API scope the site requests. Update it, and its
// date, before a tool starts handling new data or requests a new scope.

import type { Metadata } from "next";
import cardPage from "@/components/layout/CardPage.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Privacy policy",
};

const CONTACT_EMAIL = "waiac.platform@gmail.com";

export default function PrivacyPage() {
  return (
    <div className={cardPage.page}>
      <div>
        <h1 className={cardPage.title}>Privacy policy</h1>
        <p className={cardPage.muted}>Last updated: November 11, 2026</p>
      </div>

      <p>
        PennTools (penntools.org) is a student project of the Wharton AI &amp; Analytics Club. It is not an
        official service of the University of Pennsylvania.
      </p>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>What we collect</h2>
        <ul className={styles.list}>
          <li>
            <strong>Your Google account basics.</strong> When you sign in with Google, we store your name, email
            address, profile picture and Google account ID so we can keep you signed in. Only Penn (upenn.edu)
            accounts can sign in.
          </li>
          <li>
            <strong>AI API keys you save.</strong> If you add an OpenAI or Anthropic key in Settings, we store it so
            tools can make AI requests for you. Your key is used only for your own requests.
          </li>
          <li>
            <strong>How much you use AI features.</strong> For each AI request we record which tool made it, the
            model, how many tokens it used, what it cost and whose key paid, so we can give everyone free AI credit
            and see what our tools cost to run. We don&apos;t store the request itself here.
          </li>
          <li>
            <strong>Which tools you open.</strong> Each time a tool is opened, or a link to a community tool on
            another site is clicked, we record which tool and when, and who it was if they&apos;re signed in, so we can
            see how much each tool is used.
          </li>
          <li>
            <strong>What you enter into tools.</strong> Some tools save what you enter so you can come back to it,
            such as chat history.
          </li>
        </ul>
      </section>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>Google Calendar (Penn Planner)</h2>
        <p>
          If you connect Google Calendar, Penn Planner reads your calendar events to find when you&apos;re busy, so
          it doesn&apos;t suggest study blocks at those times, and adds the study blocks you choose to your
          calendar. This happens entirely in your browser: your calendar data is not sent to or stored on
          PennTools&apos; servers, is not sent to AI providers, and Penn Planner&apos;s access expires after one
          hour. You can remove its access at any time at{" "}
          <a className={cardPage.link} href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </p>
        <p>
          PennTools&apos; use and transfer of information received from Google APIs will adhere to the{" "}
          <a className={cardPage.link} href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </section>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>Who we share data with</h2>
        <p>We don&apos;t sell your data or use it for advertising. We share it only with:</p>
        <ul className={styles.list}>
          <li>
            <strong>Railway</strong>, which hosts the site and its database.
          </li>
          <li>
            <strong>OpenAI and Anthropic</strong>, which receive what you send to AI features. Requests use
            PennTools&apos; key until you&apos;ve used your free AI credit, then your own key where you&apos;ve saved
            one.
          </li>
        </ul>
      </section>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>Cookies</h2>
        <p>
          We use cookies only to keep you signed in and to remember how you&apos;ve arranged the sidebar. We
          don&apos;t use advertising or tracking cookies.
        </p>
      </section>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>Deleting your data</h2>
        <p>
          Email{" "}
          <a className={cardPage.link} href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          and we&apos;ll delete your account and everything stored with it. You can remove a saved API key in
          Settings at any time.
        </p>
      </section>

      <section className={cardPage.card}>
        <h2 className={styles.heading}>Contact and changes</h2>
        <p>
          Questions:{" "}
          <a className={cardPage.link} href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . If this policy changes, we&apos;ll update the date above.
        </p>
      </section>
    </div>
  );
}
