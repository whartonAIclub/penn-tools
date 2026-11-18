// The upload route for the admin page. A route, not a server action: Next.js
// refuses server-action requests over 1 MB, and a CareerPath export is larger.
//
// POST ?mode=preview: check the file and say what uploading it would do.
// POST ?mode=apply&fileName=…: check it again and add or update everyone in it.
// The body is the file's text: a JSON array, one object per person.

import type { NextRequest } from "next/server";
import {
  applyUpload,
  canManageData,
  checkUpload,
  MAX_UPLOAD_BYTES,
  previewUpload,
} from "@penntools/tool-industry-connector";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { db } from "../../data";

const error = (message: string, status: number, extra: object = {}) => Response.json({ error: message, ...extra }, { status });

/**
 * The body as text, or null once it's over MAX_UPLOAD_BYTES. Counted while
 * reading, since Content-Length can be missing or wrong, so an oversized body
 * is refused without holding it all (as AskPenn's stream route does).
 */
async function readBody(req: NextRequest): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > MAX_UPLOAD_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();
  // Checked before the body is read, so non-admins can't even send a file.
  if (!(await canManageData(user.id, () => isAdmin(user)))) return error("Only the tool's admins can upload data.", 403);

  const mode = req.nextUrl.searchParams.get("mode");
  if (mode !== "preview" && mode !== "apply") return error("Unknown mode.", 400);
  const sql = db();
  if (!sql) return error("The tool's database isn't available.", 503);

  const text = await readBody(req);
  if (text === null) return error(`The file is too large: at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return error("The file isn't valid JSON.", 400);
  }

  const checked = checkUpload(data);
  if (!checked.ok) return error("The file has problems, so nothing was uploaded.", 400, { problems: checked.problems });

  if (mode === "preview") return Response.json({ preview: await previewUpload(sql, checked.entries) });

  const fileName = (req.nextUrl.searchParams.get("fileName") ?? "upload.json").slice(0, 200);
  const result = await applyUpload(sql, checked.entries, { uploadedBy: user.id, fileName });
  return Response.json({ result });
}
