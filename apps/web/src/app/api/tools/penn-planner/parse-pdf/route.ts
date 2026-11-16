import { NextRequest, NextResponse } from "next/server";
import { loadGetDocument } from "@/lib/pdf";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const getDocument = await loadGetDocument();
    const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }

    return NextResponse.json({ text: pages.join("\n").trim().slice(0, 12000) });
  } catch (err) {
    console.error("[penn-planner] PDF parse error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
