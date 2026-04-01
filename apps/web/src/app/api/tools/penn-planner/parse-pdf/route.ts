import { NextRequest, NextResponse } from "next/server";

// Server-side PDF text extraction — avoids pdfjs-dist worker issues in the browser.
// pdfjs-dist runs cleanly in Node.js without a web worker.

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    // Dynamically import pdfjs-dist legacy build (Node.js compatible, no worker needed)
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);
    // Disable worker on server — not needed for Node.js text extraction
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

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
    console.error("PDF parse error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
