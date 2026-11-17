"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { CatalogTool } from "@/lib/toolCatalog";
import { trackClicks } from "@/lib/visits";

/**
 * A link to a tool on the dashboard. Community tools open in a new tab,
 * counting the click; registered tools navigate within the app, as the
 * sidebar's links do, so the page doesn't fully reload (ToolsShell records
 * those visits).
 */
export function ToolLink({ tool, className, children }: { tool: CatalogTool; className: string | undefined; children: ReactNode }) {
  return tool.external ? (
    <a href={tool.href} className={className} target="_blank" rel="noopener noreferrer" {...trackClicks(tool.visitId)}>
      {children}
    </a>
  ) : (
    <Link href={tool.href} className={className}>
      {children}
    </Link>
  );
}
