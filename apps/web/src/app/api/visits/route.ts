// POST /api/visits — records a visit to a tool, for the admin page
//
// The site's tools frame (components/layout/ToolsShell.tsx) sends
// { toolId } with navigator.sendBeacon each time someone opens a tool,
// signed in or not. Anyone can call it, so the counts are a guide rather than
// an audit; an unknown tool is ignored.

import { NextRequest, NextResponse } from "next/server";
import { toolRegistry } from "@penntools/core/tools";
import { getCurrentUser } from "@/lib/auth";
import { logger, toolVisits } from "@/lib/container";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body: unknown = await req.json().catch(() => null);
  const toolId = (body as { toolId?: unknown } | null)?.toolId;
  if (typeof toolId !== "string" || !toolRegistry.get(toolId)) {
    return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
  }

  const user = await getCurrentUser();
  try {
    await toolVisits.record(toolId, user?.id ?? null);
  } catch (error) {
    logger.error("visits.not_recorded", error);
  }
  return new NextResponse(null, { status: 204 });
}
