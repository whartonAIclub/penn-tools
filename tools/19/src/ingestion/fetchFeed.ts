/**
 * Fetches the raw ICS feed text from a URL.
 * Throws if the request fails or returns a non-2xx status.
 */
export async function fetchIcsFeed(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ICS feed (${res.status} ${res.statusText}): ${url}`
    );
  }
  return res.text();
}
