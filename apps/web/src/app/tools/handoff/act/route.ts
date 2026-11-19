// POST /tools/handoff/act: one change that carries a photo ("Post item" with its photo, or setItemPhoto; §9s item 6).
// The tool's own route, inside its page folder (there are no /api routes). Review of PR #88: a photo never goes through a server
// action, so this route reads the body with a cap (readBodyText, ACT_BODY_MAX_BYTES: the largest photo the page makes, as base64,
// with the action beside it) and refuses a larger one before holding it all, with a 413. Every other change is the act server
// action (actions.ts), which refuses a photo.
//
// The body is the act server action's input as JSON ({ viewerId, protocol, requestId, action, photo }), and the answer is the
// same ActAnswer, as JSON. The tool's handler (handleAct) does everything else, in the same order as for the server action: the
// session's user (getCurrentUser), the tab's account and protocol, the pool (toolSql) and the world (the handoff-world cookie,
// honored only in development). A cross-site page can't send it: the body must be JSON (which a plain form can't send without the
// browser asking first), and a request from another site is refused: its Origin's host must be the request's own host, compared as
// Next.js compares a server action's (sameHost), so a proxy in front of the app (https outside, http inside) doesn't refuse it.
import { cookies } from "next/headers";
import { toolSql } from "@penntools/platform/db";
import { ACT_BODY_MAX_BYTES, PHOTO_SIZE_ERROR, handleAct, type ActAnswer, type ActionContext } from "@penntools/tool-handoff";
import { getCurrentUser } from "@/lib/auth";
import { readBodyText } from "@/lib/readBody";
import { sameHost } from "../_lib/same-host";
import { WORLD_COOKIE, resolveWorldId } from "../world";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

/** The answer for a body that isn't one this route takes: invalid, in the page's own words, nothing changed. */
const invalid = (error: string, status: number): Response =>
  Response.json({ ok: false, code: "invalid", error } satisfies ActAnswer, { status, headers: NO_STORE });

export async function POST(req: Request): Promise<Response> {
  if (!sameHost(req.headers)) return new Response(null, { status: 403, headers: NO_STORE });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return new Response(null, { status: 415, headers: NO_STORE });
  const text = await readBodyText(req, ACT_BODY_MAX_BYTES);
  if (text === null) return invalid(PHOTO_SIZE_ERROR, 413);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    input = null; // the handler answers a body that isn't an object as it would the server action's
  }
  const jar = await cookies(); // Next.js 15 and later read the request's cookies asynchronously
  const ctx: ActionContext = {
    user: () => getCurrentUser(),
    sql: () => toolSql("handoff"),
    worldId: () => resolveWorldId(jar.get(WORLD_COOKIE)?.value, process.env.NODE_ENV),
  };
  return Response.json(await handleAct(ctx, input), { headers: NO_STORE });
}
