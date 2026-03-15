"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import type { ToolManifest } from "@penntools/core/tools";
import styles from "./ToolInfoButton.module.css";

export function ToolInfoButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState<ToolManifest | null>(null);

  useEffect(() => {
    const match = pathname.match(/^\/tools\/([^/]+)/);
    if (!match) return;
    const toolId = match[1];

    fetch("/api/tools")
      .then((r) => r.json())
      .then((manifests: ToolManifest[]) => {
        const found = manifests.find((m) => m.id === toolId);
        if (found) setManifest(found);
      })
      .catch(() => {});
  }, [pathname]);

  if (!manifest) return null;

  return (
    <div className={styles.wrapper}>
      <button
        className={styles.iconButton}
        onClick={() => setOpen((o) => !o)}
        aria-label="Tool information"
        aria-expanded={open}
      >
        <InfoIcon />
      </button>
      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.popup} role="dialog" aria-label="Tool info">
            <Row label="Version" value={manifest.version} />
            <Row label="Contributors" value={manifest.contributors.join(", ")} />
            {manifest.mentor && <Row label="Mentor" value={manifest.mentor} />}
            <Row label="Date of inception" value={manifest.inceptionDate} />
            <Row label="Latest release" value={manifest.latestReleaseDate} />
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
