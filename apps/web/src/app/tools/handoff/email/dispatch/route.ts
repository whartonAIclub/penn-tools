// POST /tools/handoff/email/dispatch: one run of Handoff's email dispatcher (follow-on Batch 4; FOLLOWON-PLAN §2.4 and its Addendum).
// The tool's own route, inside its page folder (there are no /api routes). email-config.ts decides what may run:
// - Development: the capture sender, for test worlds only, from this machine only (scripts/email-dispatch.mjs; the request's Host and
//   X-Forwarded-For decide, since the dev server answers on every interface). Nothing is sent.
// - Production: a scheduler's POST with `Authorization: Bearer $HANDOFF_EMAIL_DISPATCH_SECRET`, once a provider is configured
//   (HANDOFF_EMAIL_PROVIDER, HANDOFF_EMAIL_API_KEY, HANDOFF_EMAIL_FROM), with NEXTAUTH_URL over https and HANDOFF_EMAIL_ALLOWLIST.
// Whenever anything is missing it answers 404, as if it weren't there; a missing or wrong bearer gets 401; a server without a database
// 503. Only POST is exported, so Next answers every other method 405. The answer is the run's counts, nothing else: no address, id
// or text, and the dispatcher logs counts and error classes only.
import { toolSql } from "@penntools/platform/db";
import { dispatchEmail, sqlCaptureSender, storeDispatchDeps, type DispatchCounts, type EmailSender } from "@penntools/tool-handoff";
import { dispatchAuthorized, dispatchRunOptions, emailDispatchSetup, providerSender } from "../../email-config";

export const dynamic = "force-dynamic";

const COUNTS = ["swept", "claimed", "sent", "failed", "skipped", "dead", "expired", "pruned"] as const;
const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(req: Request): Promise<Response> {
  const setup = emailDispatchSetup(
    {
      NODE_ENV: process.env.NODE_ENV,
      HANDOFF_EMAIL_PROVIDER: process.env["HANDOFF_EMAIL_PROVIDER"],
      HANDOFF_EMAIL_API_KEY: process.env["HANDOFF_EMAIL_API_KEY"],
      HANDOFF_EMAIL_FROM: process.env["HANDOFF_EMAIL_FROM"],
      HANDOFF_EMAIL_DISPATCH_SECRET: process.env["HANDOFF_EMAIL_DISPATCH_SECRET"],
      NEXTAUTH_URL: process.env["NEXTAUTH_URL"],
      HANDOFF_EMAIL_ALLOWLIST: process.env["HANDOFF_EMAIL_ALLOWLIST"],
    },
    req,
  );
  if (!setup.ok) return new Response(null, { status: 404, headers: NO_STORE });
  const config = setup.config;
  if (!dispatchAuthorized(config, req.headers.get("authorization"))) return new Response(null, { status: 401, headers: NO_STORE });
  const sql = toolSql("handoff");
  if (!sql) return new Response(null, { status: 503, headers: NO_STORE });
  const run = dispatchRunOptions(config, await req.json().catch(() => null));
  const sender: EmailSender = config.mode === "capture" ? sqlCaptureSender(sql) : providerSender(config);
  try {
    const counts = await dispatchEmail(sql, { sender, siteUrl: config.siteUrl, worlds: config.worlds, ...run }, storeDispatchDeps);
    return Response.json(countsOnly(counts), { headers: NO_STORE });
  } catch (e) {
    console.error("[handoff] email dispatch failed", { error: e instanceof Error ? e.name || "Error" : typeof e });
    return new Response(null, { status: 500, headers: NO_STORE });
  }
}

/** The run's eight numbers, whatever else the result might hold. */
function countsOnly(c: DispatchCounts): DispatchCounts {
  const out = {} as DispatchCounts;
  for (const k of COUNTS) out[k] = typeof c[k] === "number" && Number.isFinite(c[k]) ? c[k] : 0;
  return out;
}
