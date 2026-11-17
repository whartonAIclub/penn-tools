import { NextRequest, NextResponse } from "next/server";
import { withPdf } from "@/lib/pdf";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const text = await withPdf(new Uint8Array(await file.arrayBuffer()), async (pdf) => {
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      }
      return pages.join("\n");
    });
    return NextResponse.json({ text: text.trim().slice(0, 12000) });
  } catch (err) {
    console.error("[penn-planner] PDF parse error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
