import { NextRequest, NextResponse } from "next/server";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// Disable the worker for server-side Node.js — pdfjs falls back to a FakeWorker
GlobalWorkerOptions.workerSrc = "";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageText = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
      text += pageText + "\n";
    }

    return NextResponse.json({ text: text.trim().slice(0, 12000) });
  } catch (err) {
    console.error("[penn-planner] PDF parse error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
