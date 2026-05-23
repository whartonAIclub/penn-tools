// Simple in-memory sliding-window rate limiter.
// Resets on server restart — good enough for a deployed Next.js app
// where the goal is protecting against accidental or casual abuse.

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

// Clean up expired entries occasionally to avoid unbounded growth.
let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, w] of store) {
    if (now > w.resetAt) store.delete(key);
  }
}

export interface RateLimitOptions {
  limit: number;       // max requests per window
  windowMs: number;    // window size in milliseconds
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(ip: string, opts: RateLimitOptions): RateLimitResult {
  maybeCleanup();
  const now = Date.now();
  const existing = store.get(ip);

  if (!existing || now > existing.resetAt) {
    store.set(ip, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs };
  }

  existing.count += 1;
  const remaining = Math.max(0, opts.limit - existing.count);
  return {
    allowed: existing.count <= opts.limit,
    remaining,
    resetAt: existing.resetAt,
  };
}
