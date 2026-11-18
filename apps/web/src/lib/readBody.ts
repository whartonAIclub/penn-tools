// Reading a request body with a size cap, for tool routes that take large
// JSON bodies (AskPenn's stream route, Resume Customizer's tailor route).

/**
 * The body as text, or null once it's over `maxBytes`. Counted while reading,
 * since Content-Length can be missing or wrong, so an oversized body is
 * refused without holding it all.
 */
export async function readBodyText(req: Request, maxBytes: number): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > maxBytes) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
