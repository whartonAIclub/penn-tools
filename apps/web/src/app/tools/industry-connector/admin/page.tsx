// The Industry Connections Tool's upload page, for its admins: load the
// CareerPath data into the tool's database, and add to it later (e.g. a new
// class year). Access is checked here on the server before any data is read,
// and again in ./upload/route.ts. Not linked for anyone else, and not indexed.

import type { Metadata } from "next";
import Link from "next/link";
import { canManageData, lastUpload, MAX_UPLOAD_BYTES } from "@penntools/tool-industry-connector";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { db } from "../data";
import { AdminUpload } from "./AdminUpload";
import styles from "../IndustryConnector.module.css";

const TITLE = "Industry Connections Tool: upload data";

export const metadata: Metadata = {
  title: TITLE,
  robots: { index: false, follow: false },
};

const EXAMPLE = `[
  {
    "name": "Jordan Example",
    "gradYear": 2026,
    "program": "FT MBA",
    "isAlumni": true,
    "currentEmployer": "Example Capital",
    "currentTitle": "Associate",
    "industries": ["Consulting", "Financial Services: Venture Capital"]
  }
]`;

export default async function AdminPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return <SignInPrompt title={TITLE} message="Sign in with an admin account to upload data." />;
  if (!(await canManageData(user.id, () => isAdmin(user)))) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{TITLE}</h1>
        <p className={styles.muted}>This page is only for the tool&apos;s admins.</p>
      </div>
    );
  }

  const sql = db();
  const last = sql ? await lastUpload(sql) : null;

  return (
    <div className={styles.page}>
      <header>
        <Link href="/tools/industry-connector" className={styles.back}>
          ← Back to the tool
        </Link>
        <h1 className={styles.title}>{TITLE}</h1>
        <p className={styles.muted}>
          Uploads add to the directory: new people are added, people already loaded are updated, and everyone else
          stays as they are.
        </p>
      </header>

      {!sql ? (
        <p className={styles.notice} role="status">
          The tool&apos;s database isn&apos;t available. If it&apos;s newly set up, check that the Platform team has
          enabled it.
        </p>
      ) : (
        <p className={styles.notice} role="status">
          {last
            ? `Last loaded ${new Date(last.uploadedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} by ${
                last.uploadedBy === user.id ? "you" : `user ${last.uploadedBy}`
              } from ${last.fileName}: ${last.addedCount} added, ${last.updatedCount} updated.`
            : "No data has been loaded yet: students see a note that the directory is coming soon."}
        </p>
      )}

      <section aria-labelledby="format">
        <h2 id="format" className={styles.subtitle}>File format</h2>
        <p className={styles.muted}>
          A <strong>.json</strong> file (at most {MAX_UPLOAD_BYTES / 1024 / 1024} MB): an array with one object per
          person. <code>name</code>, <code>gradYear</code>, <code>program</code>, <code>isAlumni</code> and{" "}
          <code>industries</code> (one or more of the tool&apos;s 43 CareerPath industries, spelled exactly) are
          required. <code>currentEmployer</code> and <code>currentTitle</code> may be empty. Other fields are
          ignored. People are matched across uploads by name, class year and program, so spell names the same way
          in every file: a different spelling adds the person again. If any entry is wrong, nothing is uploaded.
        </p>
        <pre className={styles.code}>{EXAMPLE}</pre>
      </section>

      {sql && <AdminUpload />}
    </div>
  );
}
