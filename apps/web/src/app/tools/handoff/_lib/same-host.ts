// Whether a request to one of Handoff's own routes comes from Handoff's own pages (act/route.ts).

/**
 * True when the request sends no Origin, or its Origin's host is this site's: the first X-Forwarded-Host, else Host, as Next.js checks
 * a server action's. Only the host: behind a proxy the app's own URL can say http where the browser's Origin says https.
 */
export function sameHost(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (origin === null) return true; // no Origin: not a browser's cross-site request (the route checks the content type too)
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false; // "null" (a sandboxed page) or anything else that isn't an address
  }
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return host !== "" && (host === forwarded || host === headers.get("host"));
}
