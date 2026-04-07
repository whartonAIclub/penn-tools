/**
 * exportResume.ts — client-side export helpers for the Resume Customizer.
 * Runs only in the browser (called from "use client" components).
 */

/**
 * Render `contentHtml` off-screen, capture it with html2canvas, and save as PDF.
 * The container is styled to match the US Letter PdfCard dimensions.
 */
export async function downloadAsPDF(
  contentHtml: string,
  filename = "resume.pdf",
): Promise<void> {
  const { default: jsPDF }     = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  // Render HTML in a hidden, fixed-size container that mirrors PdfCard
  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "top:-20000px",
    "left:-20000px",
    "width:816px",
    "min-height:1056px",
    "background:#fff",
    "padding:72px",
    "box-sizing:border-box",
    "font-family:'Times New Roman',Times,serif",
    "font-size:12pt",
    "color:#111",
    "line-height:1.35",
  ].join(";");
  container.innerHTML = contentHtml;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 816,
      windowWidth: 816,
    });

    // US Letter at 72 dpi in jsPDF "pt" units = 612 × 792
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const imgData = canvas.toDataURL("image/png");
    const imgH    = (canvas.height / canvas.width) * pageW;

    // If the content is taller than one page, add extra pages
    let yOffset = 0;
    while (yOffset < imgH) {
      if (yOffset > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, -yOffset, pageW, imgH);
      yOffset += pageH;
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Download the resume as a Word-compatible .doc file (HTML-in-Word wrapper).
 */
export function downloadAsWord(contentHtml: string, filename = "resume.doc"): void {
  const wordHtml = `\
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/></head>
<body style="font-family:'Times New Roman',serif;font-size:12pt;margin:72px;">
${contentHtml}
</body>
</html>`;

  const blob = new Blob([wordHtml], { type: "application/msword" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Copy plain text to the clipboard. */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
