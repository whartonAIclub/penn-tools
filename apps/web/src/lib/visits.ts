// Records visits to tools for the admin page (POST /api/visits): opening a
// registered tool (components/layout/ToolsShell.tsx), and clicking a community
// tool's link in the site sidebar or on the dashboard.

import type { MouseEvent } from "react";

/**
 * Records a visit under a tool's visit ID (CatalogTool.visitId). Browser-only.
 * A beacon, so it's sent even as the page changes.
 */
export function recordVisit(visitId: string): void {
  navigator.sendBeacon?.("/api/visits", JSON.stringify({ toolId: visitId }));
}

/**
 * Handlers for a community tool's link that record each click: a plain click,
 * one with a modifier key, Enter, a tap, or a middle-click. "Open in new tab"
 * from the right-click or long-press menu can't be seen, so it isn't counted.
 */
export function trackClicks(visitId: string) {
  return {
    onClick: () => recordVisit(visitId),
    onAuxClick: (event: MouseEvent) => {
      if (event.button === 1) recordVisit(visitId);
    },
  };
}
