// POST /tools/pass-it-on/library/upload — adds one file to the library
//
// Body: multipart form with `file` (a .docx, .xlsx, .csv, .txt, .md, .pdf or a
// .zip of those), optional `tags` (comma-separated), `eventId`, and `confirm`
// ("yes" once a person has checked a flagged file holds no logins).
// Responds with the LibraryUploadResult as JSON: status "saved", "blocked",
// "needs_confirmation" or "empty". Files named like the Pub Email & Social
// Accounts document are always blocked.

import type { NextRequest } from "next/server";
import { checkTags, databaseProblem, databaseProblemMessage } from "@penntools/tool-pass-it-on";
import { uploadLibraryFile, ZipTooLargeError } from "@penntools/tool-pass-it-on/imports";
import { getEmbeddings } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { maybeDb } from "../../db";

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();
  const sql = maybeDb();
  if (!sql) return Response.json({ error: "Pass It On's database is not configured." }, { status: 500 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file to upload." }, { status: 400 });

  const tags = checkTags(String(form.get("tags") ?? "").split(","));
  if (!tags.ok) return Response.json({ error: tags.message }, { status: 400 });
  const eventId = String(form.get("eventId") ?? "") || null;

  try {
    const result = await uploadLibraryFile({
      sql,
      embeddings: await getEmbeddings("pass-it-on"),
      filename: file.name,
      data: new Uint8Array(await file.arrayBuffer()),
      tags: tags.value,
      eventId,
      uploadedBy: user.id,
      confirmedNoCredentials: form.get("confirm") === "yes",
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZipTooLargeError) return Response.json({ error: error.message }, { status: 400 });
    const problem = databaseProblem(error);
    if (problem) return Response.json({ error: databaseProblemMessage(problem) }, { status: 503 });
    throw error;
  }
}
