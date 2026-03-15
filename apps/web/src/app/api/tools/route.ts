// GET /api/tools — returns the manifests of all registered tools
//
// Safe to call from client components. Returns only the manifest (no
// execute logic). Bootstrap is guaranteed by importing container.

import { NextResponse } from "next/server";
import { toolRegistry } from "@penntools/core/tools";
import "@/lib/container"; // side-effect: registers all tools

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(toolRegistry.listManifests());
}
