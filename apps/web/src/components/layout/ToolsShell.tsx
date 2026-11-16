"use client";

// The frame around a tool's pages (see app/tools/layout.tsx, which reads the
// manifests on the server): a centered column, or the whole page area for a
// full-width tool. The tool's name and info button are in the site header.
// It also records a visit (lib/visits.ts) each time a tool is opened, for the
// admin page; moving between pages within a tool isn't another visit.

import { useEffect, useRef } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { recordVisit } from "@/lib/visits";
import styles from "./ToolsShell.module.css";

export function ToolsShell({ fullWidth, children }: { fullWidth: string[]; children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const full = segment !== null && fullWidth.includes(segment);

  // Kept across React's development-only double run of effects, so a visit
  // is recorded once.
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (segment === null || recorded.current === segment) return;
    recorded.current = segment;
    recordVisit(segment);
  }, [segment]);

  return (
    <div className={styles.container}>
      <main className={full ? `${styles.content} ${styles.contentFullBleed}` : styles.content}>
        {children}
      </main>
    </div>
  );
}
