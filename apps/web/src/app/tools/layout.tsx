"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { ToolInfoButton } from "@/components/layout/ToolInfoButton";
import styles from "./layout.module.css";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const isCareerCanvas = segment === "8";

  return (
    <div className={styles.container}>
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
