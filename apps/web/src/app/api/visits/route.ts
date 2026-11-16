// POST /api/visits — records a visit to a tool, for the admin page
//
// The site sends { toolId } with navigator.sendBeacon (lib/visits.ts), signed
// in or not: a registered tool's ID each time it's opened, or a community
// tool's visit ID (communityVisitId) each time its link is clicked. Anyone can
// call it, so the counts are a guide rather than an audit; an unknown tool is
// refused.

import { NextRequest, NextResponse } from "next/server";
import { toolRegistry } from "@penntools/core/tools";
import { getCurrentUser } from "@/lib/auth";
import { logger, toolVisits } from "@/lib/container";
import { communityToolByVisitId } from "@/data/communityTools";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body: unknown = await req.json().catch(() => null);
  const toolId = (body as { toolId?: unknown } | null)?.toolId;
  if (typeof toolId !== "string" || !(toolRegistry.get(toolId) || communityToolByVisitId(toolId))) {
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
