// Browser-side text extraction from a PDF, with pdfjs-dist (already a web app
// dependency). Runs only in "use client" code.

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line.trim());
        line = "";
      } else if (item.str && !line.endsWith(" ")) {
        line += " ";
      }
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.filter(Boolean).join("\n"));
  }

  return pages.join("\n\n");
}
