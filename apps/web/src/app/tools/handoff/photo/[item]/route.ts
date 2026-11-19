// GET /tools/handoff/photo/<item id>?v=<version>: a Goods item's one photo (USER-INSTRUCTIONS §9s item 6).
// The tool's own route, inside its page folder (there are no /api routes). The image lives in Handoff's item_photos table; an item
// in a view carries only its reference (pic: the version and size), and the page builds this address from it (_lib/photo.js).
//
// Who gets it is who sees the item, decided at the moment of the request by the tool's handler (handleGetPhoto, tools/handoff):
// a signed-out visitor for an item that is available now; a signed-in account for an item that hasn't ended. Everything else is a
// bare 404: no such item, no photo, an item on hold, paused, sold, closed or expired for this viewer, or an address made for an
// earlier photo (?v= names the version, so a replaced photo's address stops working).
//
// The viewer is the session's user (getCurrentUser) or nobody, and the market is the page's (the handoff-world cookie, honored only
// in development). It writes nothing. The answer is private to the browser that asked (it depends on the session) and revalidated by
// ETag on every use (no-cache), so a photo stops showing as soon as its item does; the bytes are served as the stored type only.
import { cookies } from "next/headers";
import { toolSql } from "@penntools/platform/db";
import { handleGetPhoto, type ActionContext } from "@penntools/tool-handoff";
import { getCurrentUser } from "@/lib/auth";
import { WORLD_COOKIE, resolveWorldId } from "../../world";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(req: Request, { params }: RouteContext<"/tools/handoff/photo/[item]">): Promise<Response> {
  // Next.js 15 and later hand a route its params, and the request's cookies, asynchronously. RouteContext types the params from this
  // route's own path (review of PR #88), so renaming the [item] segment is a type error rather than a silent 404.
  const [{ item }, jar] = await Promise.all([params, cookies()]);
  const ctx: ActionContext = {
    user: () => getCurrentUser(),
    sql: () => toolSql("handoff"),
    worldId: () => resolveWorldId(jar.get(WORLD_COOKIE)?.value, process.env.NODE_ENV),
  };
  // The version the browser already holds (its ETag), so an unchanged photo that's still this viewer's to see is a 304, its bytes
  // never read (review of PR #88: each photo request read the whole market; now it reads the item's own rows).
  const etag = /^"([0-9a-f]{16})"$/.exec(req.headers.get("if-none-match") ?? "")?.[1];
  const answer = await handleGetPhoto(ctx, { itemId: item, version: new URL(req.url).searchParams.get("v") ?? undefined, ...(etag ? { etag } : {}) });
  if (!answer.ok) return new Response(null, { status: answer.status, headers: NO_STORE });
  const headers = {
    // Review of PR #88: no-cache, so the browser asks each time (its ETag makes an unchanged photo a 304). With max-age a photo stayed
    // visible for up to 10 minutes after its item was held or sold, though the route would refuse it by then.
    "cache-control": "private, no-cache",
    vary: "Cookie",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "content-security-policy": "default-src 'none'",
  };
  if ("notModified" in answer) return new Response(null, { status: 304, headers: { ...headers, etag: `"${answer.version}"` } });
  const { photo } = answer;
  const body = new Uint8Array(photo.bytes); // a copy on its own ArrayBuffer, as a Response body is typed
  return new Response(body, {
    headers: { ...headers, "content-type": photo.mime, etag: `"${photo.version}"`, "content-length": String(body.byteLength) },
  });
}
