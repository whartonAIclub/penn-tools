// GET /tools/pennpaws/photo/[id]: a request's pet photo. Lists of requests
// link here instead of carrying every photo inline, so the browser fetches
// each one once and caches it. Only people who may open the request get it
// (requestPhoto in the tool); everyone else gets a 404.

import { toolSql } from "@penntools/platform/db";
import { isTeamEmail, requestPhoto } from "@penntools/tool-pennpaws";
import { getCurrentUser } from "@/lib/auth";
import { ALLOW_LOCAL_TEST_ACCOUNT } from "../../school";

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

// Next 16 hands route params over as a promise. RouteContext types them from
// this route's own path, so renaming the [id] folder is a type error.
export async function GET(_req: Request, { params }: RouteContext<"/tools/pennpaws/photo/[id]">): Promise<Response> {
  const { id } = await params;
  const user = await getCurrentUser();
  const sql = toolSql("pennpaws");
  if (!user || !sql) return new Response(null, { status: 404 });
  const photo = await requestPhoto(sql, user.id, String(id), isTeamEmail(user.email, ALLOW_LOCAL_TEST_ACCOUNT));
  const parts = photo ? DATA_URL.exec(photo) : null;
  if (!parts) return new Response(null, { status: 404 });
  return new Response(Buffer.from(parts[2]!, "base64"), {
    headers: {
      "Content-Type": parts[1]!,
      // Private: who may see a photo depends on who's signed in. The link carries the photo's version, so caching is safe.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
