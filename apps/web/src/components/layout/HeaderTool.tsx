"use client";

// On a tool's pages, "/ Tool name" after PennTools in the site header, with
// the info button (the tool's description and contributors). It's in the header
// rather than on the page so it can't cover anything a tool draws. Nothing shows
// on other pages, or on a page under /tools that isn't a registered tool.

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import type { ToolInfo } from "@/lib/toolCatalog";
import { ToolInfoButton } from "./ToolInfoButton";
import styles from "./SiteHeader.module.css";

export function HeaderTool({ tools }: { tools: Record<string, ToolInfo> }) {
  // From the root layout, the segments of /tools/pass-it-on/board are
  // ["tools", "pass-it-on", "board"].
  const [section, id] = useSelectedLayoutSegments();
  const tool = section === "tools" && id !== undefined ? tools[id] : undefined;
  if (!tool) return null;

  return (
    <div className={styles.tool}>
      <span className={styles.separator} aria-hidden="true">/</span>
      <Link href={`/tools/${id}`} className={styles.toolName}>
        {tool.title}
      </Link>
      <ToolInfoButton tool={tool} />
    </div>
  );
}
