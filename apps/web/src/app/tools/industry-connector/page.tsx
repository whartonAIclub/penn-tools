// Industry Connections Tool: choose an industry, see Wharton students and
// alumni who have worked in it, and draft an outreach note to one of them.
// Signed-out visitors are asked to sign in. The directory comes from the
// tool's database, which admins fill through ./admin. Drafting notes runs on
// the user's free AI credit, then on their own key; search needs neither.

import type { Metadata } from "next";
import Link from "next/link";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import {
  AFTER_CONVERSATION,
  canManageData,
  INDUSTRIES,
  LENGTHS,
  MESSAGE_TYPES,
  PURPOSES,
  TONES,
} from "@penntools/tool-industry-connector";
import { isAdmin } from "@/lib/admin";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { cachedIndustryCounts, db, TOOL_ID } from "./data";
import { IndustryConnector } from "./IndustryConnector";
import styles from "./IndustryConnector.module.css";

const TITLE = "Industry Connections Tool";

export const metadata: Metadata = {
  title: TITLE,
};

export default async function IndustryConnectorPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title={TITLE} />;

  const canUpload = await canManageData(user.id, () => isAdmin(user));
  const sql = db();
  const counts = sql ? await cachedIndustryCounts(sql) : null;

  if (!counts || Object.keys(counts).length === 0) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{TITLE}</h1>
        <p className={styles.muted} role="status">
          {counts
            ? "The student and alumni directory hasn't been loaded yet. Check back soon."
            : "The directory isn't available right now. Try again later."}
        </p>
        {canUpload && counts && (
          <p>
            <Link href="/tools/industry-connector/admin" className={styles.link}>
              Upload the CareerPath data
            </Link>
          </p>
        )}
      </div>
    );
  }

  // Empty once the user has used their free AI credit and saved no key; search still works then.
  const providers = await (await getAI(TOOL_ID))!.providers();

  return (
    <IndustryConnector
      industries={[...INDUSTRIES]}
      counts={counts}
      canUpload={canUpload}
      outreach={{
        providers,
        labels: PROVIDER_LABELS,
        senderName: user.name ?? "",
        messageTypes: [...MESSAGE_TYPES],
        purposes: [...PURPOSES],
        tones: [...TONES],
        lengths: [...LENGTHS],
        afterConversation: [...AFTER_CONVERSATION],
      }}
    />
  );
}
