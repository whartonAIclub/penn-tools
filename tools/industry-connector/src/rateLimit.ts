// A per-user limit on how often an action can run, so nobody can script the
// search to copy the whole directory. Kept in memory: a server restart resets
// it, which is fine for a limit meant to stop bulk copying, not to bill anyone.

export interface RateLimiter {
  /** Records one use by `key` and says whether it's allowed (false once over the limit). */
  allow(key: string, now?: number): boolean;
}

/** At most `limit` uses per `windowMs` for each key, counted over a sliding window. */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const uses = new Map<string, number[]>();
  return {
    allow(key, now = Date.now()) {
      const recent = (uses.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        uses.set(key, recent);
        return false;
      }
      recent.push(now);
      uses.set(key, recent);
      // Forget idle keys now and then, so the map can't grow without end.
      if (uses.size > 10_000) {
        for (const [k, times] of uses) if (times.every((t) => now - t >= windowMs)) uses.delete(k);
      }
      return true;
    },
  };
}
