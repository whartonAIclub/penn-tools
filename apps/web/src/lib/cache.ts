// Caching a slow read, such as a database query every page load would
// otherwise repeat, for pages anyone can load. Values are kept in this server
// process's memory.
//
// - cachedFor (/stats): what callers get is never older than maxAgeMs. Once
//   it is, the next caller waits for a fresh read, and a failed read fails
//   the call; the page can't show anything without it.
// - cachedOrStale (the home page's top tools): the page must stay fast when
//   the source is slow or down, so callers get the last value read when a
//   fresh read fails or takes longer than waitMs.

/**
 * A function returning load()'s result, calling load() again only once the
 * last call is maxAgeMs old. Callers that arrive while it's loading share
 * that call. A failed load isn't kept, so the next caller tries again.
 */
export function cachedFor<T>(maxAgeMs: number, load: () => Promise<T>, now: () => number = Date.now): () => Promise<T> {
  let cached: { loadedAt: number; value: Promise<T> } | null = null;
  return () => {
    if (!cached || now() - cached.loadedAt >= maxAgeMs) {
      const value = load();
      cached = { loadedAt: now(), value };
      value.catch(() => {
        if (cached?.value === value) cached = null;
      });
    }
    return cached.value;
  };
}

/** What cachedOrStale's wait resolves to when the load takes too long. */
const TIMED_OUT = Symbol("timed out");

/**
 * A function returning load()'s latest result, calling load() again once the
 * last attempt is maxAgeMs old. When that fresh load fails or takes longer
 * than waitMs, it returns the last value loaded instead, or null if none has
 * loaded yet; a slow load keeps going and is used once it finishes. Callers
 * that arrive while it's loading share that load, waiting only what's left of
 * waitMs since it started, so a load that hangs delays one caller, not every
 * one. After a failed load it waits maxAgeMs before trying again. It never
 * rejects: load() should log its own errors.
 */
export function cachedOrStale<T>(
  maxAgeMs: number,
  waitMs: number,
  load: () => Promise<T>,
  now: () => number = Date.now,
): () => Promise<T | null> {
  let last: T | null = null;
  let attemptedAt = -Infinity;
  let loading: Promise<T> | null = null;
  return async () => {
    if (!loading && now() - attemptedAt >= maxAgeMs) {
      attemptedAt = now();
      const attempt = load().then((value) => (last = value));
      loading = attempt;
      attempt.then(
        () => (loading = null),
        () => (loading = null),
      );
    }
    if (!loading) return last;
    const waitLeft = attemptedAt + waitMs - now();
    if (waitLeft <= 0) return last;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<typeof TIMED_OUT>((resolve) => (timer = setTimeout(() => resolve(TIMED_OUT), waitLeft)));
    try {
      const result = await Promise.race([loading, timedOut]);
      return result === TIMED_OUT ? last : result;
    } catch {
      return last;
    } finally {
      clearTimeout(timer);
    }
  };
}
