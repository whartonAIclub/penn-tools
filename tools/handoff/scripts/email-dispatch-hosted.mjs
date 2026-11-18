#!/usr/bin/env node
// Hosted scheduler for the existing Handoff dispatch route. No provider key or DB access.
// --check validates configuration without a request. Default: one run. --watch: every 60s.
// This is a foreground worker for the host to supervise, never an in-process Next timer.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const COUNT_KEYS = ["swept", "claimed", "sent", "failed", "skipped", "dead", "expired", "pruned"];
export function settings(env) {
  let site;
  try { site = new URL(env.NEXTAUTH_URL || ""); } catch { throw new Error("NEXTAUTH_URL must be the hosted HTTPS origin."); }
  if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash || site.pathname !== "/" ||
      site.hostname === "localhost" || site.hostname.endsWith(".localhost") || site.hostname === "[::1]" || /^127\./.test(site.hostname)) {
    throw new Error("NEXTAUTH_URL must be a public HTTPS origin without credentials, a path, query or fragment.");
  }
  const secret = env.HANDOFF_EMAIL_DISPATCH_SECRET || "";
  if (!/^[\x21-\x7e]{32,}$/.test(secret)) throw new Error("HANDOFF_EMAIL_DISPATCH_SECRET must contain at least 32 printable non-space ASCII characters.");
  const limit = env.HANDOFF_EMAIL_BATCH_LIMIT === undefined ? 5 : Number(env.HANDOFF_EMAIL_BATCH_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("HANDOFF_EMAIL_BATCH_LIMIT must be an integer from 1 to 100.");
  return { url: new URL("/tools/handoff/email/dispatch", site.origin).href, secret, limit };
}

export async function runOnce(config, fetcher = fetch, stopSignal) {
  const signal = stopSignal ? AbortSignal.any([AbortSignal.timeout(150000), stopSignal]) : AbortSignal.timeout(150000);
  let response;
  try {
    response = await fetcher(config.url, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.secret },
      body: JSON.stringify({ limit: config.limit }), redirect: "error", signal
    });
  } catch {
    return { ok: false, message: "Dispatch request failed or timed out; no response details logged." };
  }
  if (!response.ok) {
    try { await response.body?.cancel(); } catch {}
    const why = {
      401: "Dispatch secret does not match the app.",
      404: "Dispatch route is absent or the app email configuration is incomplete.",
      503: "Handoff database is unavailable."
    }[response.status] || "Dispatch route returned an error.";
    return { ok: false, message: "HTTP " + response.status + ": " + why };
  }
  let data;
  try { data = await response.json(); } catch { return { ok: false, message: "Dispatch response was not JSON." }; }
  if (!data || !COUNT_KEYS.every(k => Number.isSafeInteger(data[k]) && data[k] >= 0)) {
    return { ok: false, message: "Dispatch response did not contain valid counts." };
  }
  // Never print arbitrary server text: it may contain private addresses or ticket details.
  const counts = Object.fromEntries(COUNT_KEYS.map(k => [k, data[k]]));
  return { ok: counts.failed === 0 && counts.dead === 0, message: COUNT_KEYS.map(k => k + "=" + counts[k]).join(" "), counts };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.includes("--help")) {
    console.log("Usage: node tools/handoff/scripts/email-dispatch-hosted.mjs [--check | --watch]");
    console.log("Needs NEXTAUTH_URL and HANDOFF_EMAIL_DISPATCH_SECRET. Optional HANDOFF_EMAIL_BATCH_LIMIT (default 5).");
    return 0;
  }
  if (args.some(x => x !== "--check" && x !== "--watch") || (args.includes("--check") && args.includes("--watch"))) {
    console.error("Use --check, --watch, or no argument."); return 1;
  }
  let config;
  try { config = settings(env); } catch (error) { console.error(error.message); return 1; }
  if (args.includes("--check")) {
    console.log("Scheduler configuration is valid. No request sent; provider credentials and delivery remain unverified.");
    return 0;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    do {
      const started = Date.now();
      const result = await runOnce(config, fetch, controller.signal);
      if (controller.signal.aborted) return 0;
      (result.ok ? console.log : console.error)(new Date().toISOString() + " " + result.message);
      if (!args.includes("--watch")) return result.ok ? 0 : 1;
      // Sequential runs only; if a run exceeds one minute, wait briefly before the next.
      await delay(Math.max(1000, 60000 - (Date.now() - started)), undefined, { signal: controller.signal });
    } while (!controller.signal.aborted);
    return 0;
  } catch (error) {
    if (controller.signal.aborted) return 0;
    console.error("Scheduler stopped unexpectedly."); return 1;
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}
// Started as a program, not imported by a test. Real paths on both sides, so a start through a linked folder still runs
// instead of falling through as a silent exit 0.
function startedDirectly() {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (startedDirectly()) process.exitCode = await main();
