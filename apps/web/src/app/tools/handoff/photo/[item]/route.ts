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
// in development). It writes nothing. The answer is private to the browser that asked (it depends on the session), cached there
// for ten minutes and revalidated by ETag; the bytes are served as the stored type only, never sniffed.
import { cookies } from "next/headers";
import { toolSql } from "@penntools/platform/db";
import { handleGetPhoto, type ActionContext } from "@penntools/tool-handoff";
import { getCurrentUser } from "@/lib/auth";
import { WORLD_COOKIE, resolveWorldId } from "../../world";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(req: Request, { params }: { params: { item: string } }): Promise<Response> {
  const ctx: ActionContext = {
    user: () => getCurrentUser(),
    sql: () => toolSql("handoff"),
    worldId: () => resolveWorldId(cookies().get(WORLD_COOKIE)?.value, process.env.NODE_ENV),
  };
  const answer = await handleGetPhoto(ctx, { itemId: params.item, version: new URL(req.url).searchParams.get("v") ?? undefined });
  if (!answer.ok) return new Response(null, { status: answer.status, headers: NO_STORE });
  const { photo } = answer;
  const headers = {
    "content-type": photo.mime,
    "cache-control": "private, max-age=600",
    etag: `"${photo.version}"`,
    vary: "Cookie",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "content-security-policy": "default-src 'none'",
  };
  if (req.headers.get("if-none-match") === headers.etag) return new Response(null, { status: 304, headers });
  const body = new Uint8Array(photo.bytes); // a copy on its own ArrayBuffer, as a Response body is typed
  return new Response(body, { headers: { ...headers, "content-length": String(body.byteLength) } });
}
