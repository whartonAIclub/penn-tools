"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import styles from "../PassItOn.module.css";
import { revertTemplateAction, setIssueStatusAction } from "../board/actions";

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const call = (fn: () => Promise<{ ok: boolean; message?: string }>, then?: (router: ReturnType<typeof useRouter>) => void) =>
    start(async () => {
      setError(null);
      try {
        const result = await fn();
        if (!result.ok) return setError(result.message ?? "That didn't work.");
        if (then) then(router);
        router.refresh();
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  return { error, pending, call };
}

export function RevertButton({ versionId, version }: { versionId: number; version: number }) {
  const { error, pending, call } = useAction();
  return (
    <>
      <button
        type="button"
        className={styles.secondary}
        disabled={pending}
        onClick={() =>
          window.confirm(`Make a new version that copies version ${version}? Events already generated keep the version they have.`) &&
          call(() => revertTemplateAction(versionId), (router) => router.push("/tools/pass-it-on/template"))
        }
      >
        Revert to this version
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </>
  );
}

export function IssueButton({ issueId, status }: { issueId: number; status: "open" | "resolved" }) {
  const { error, pending, call } = useAction();
  return (
    <>
      <button type="button" className={styles.secondary} disabled={pending} onClick={() => call(() => setIssueStatusAction(issueId, status === "open" ? "resolved" : "open"))}>
        {status === "open" ? "Mark resolved" : "Reopen"}
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </>
  );
}
