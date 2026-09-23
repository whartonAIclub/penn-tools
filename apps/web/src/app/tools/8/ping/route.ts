import { NextResponse } from "next/server";
import { ccDb } from "@penntools/tool-8";

export async function GET() {
  try {
    await ccDb.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
