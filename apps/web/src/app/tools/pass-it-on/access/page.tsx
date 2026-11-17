// The Access tab: who on the board can use Pass It On.

import { listBoardAccess } from "@penntools/tool-pass-it-on";
import { getAccess } from "../access";
import { db } from "../db";
import styles from "../PassItOn.module.css";
import { AccessEditor } from "./AccessEditor";

export default async function AccessPage() {
  const access = await getAccess();
  if (access.kind !== "member") return null;
  const members = await listBoardAccess(db());

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>Access</h2>
      <p className={styles.muted}>
        These Penn emails can open Pass It On, and so can PennTools site admins. Anyone on the list can add or remove people. Use the email each person
        signs in to PennTools with.
      </p>
      {access.via === "admin" && <p className={styles.muted}>You have access as a PennTools site admin, not from this list.</p>}
      <AccessEditor members={members.map((m) => ({ email: m.email, addedBy: m.addedBy }))} you={access.user.email?.toLowerCase() ?? null} />
    </section>
  );
}
