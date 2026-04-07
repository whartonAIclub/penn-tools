"use client";

import Link from "next/link";
import { useSelectedLayoutSegment, usePathname } from "next/navigation";
import { ToolInfoButton } from "@/components/layout/ToolInfoButton";
import styles from "./layout.module.css";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const pathname = usePathname();
  const isCareerCanvas = segment === "8";
  const isCareerCanvasWizard = pathname === "/tools/8/wizard";

  // On the wizard sub-page, back goes to the Career Canvas landing page
  const backHref = isCareerCanvasWizard ? "/tools/8" : "/";
  const backLabel = isCareerCanvasWizard ? "← Career Canvas" : "← AskPenn";

  return (
    <div className={styles.container}>
      {!isCareerCanvasWizard && (
        <Link
          href={backHref}
          className={isCareerCanvas ? `${styles.back} ${styles.backCareerCanvas}` : styles.back}
        >
          {backLabel}
        </Link>
      )}
      {!isCareerCanvas && (
        <div className={styles.infoCorner}>
          <ToolInfoButton />
        </div>
      )}
      <main className={isCareerCanvas ? `${styles.content} ${styles.contentFullBleed}` : styles.content}>
        {children}
      </main>
    </div>
  );
}
