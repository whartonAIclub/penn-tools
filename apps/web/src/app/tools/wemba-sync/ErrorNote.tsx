// An upload's error, with a link to Settings when the user's key is the problem.

import Link from "next/link";
import { isSettingsError } from "@penntools/core/ai/errors";
import type { UploadError } from "./client";
import styles from "./WembaSync.module.css";

export function ErrorNote({ error }: { error: UploadError }) {
  return (
    <p className={styles.error} role="alert">
      {error.message}
      {isSettingsError(error.kind) && (
        <>
          {" "}
          <Link href="/settings" className={styles.link}>
            Open Settings
          </Link>
        </>
      )}
    </p>
  );
}
