// POST /tools/pass-it-on/calendar/upload — reads a club's calendar spreadsheet
// and saves the events the AI proposes from it, for people to approve.
//
// Body: multipart form with `file` (.xlsx), `provider` (an AI provider the
// user has a key for) and `confirm` ("yes" once a person has checked a flagged
// file holds no logins). Responds with JSON: status "saved" (with `importId`),
// "needs_confirmation", "blocked" or "empty"; or `error` (with `kind` for AI
// problems such as a missing key). Nothing becomes an event here.

import type { NextRequest } from "next/server";
import { isAIError } from "@penntools/core/ai";
import {
  checkUploadForCredentials,
  createCalendarImport,
  databaseProblem,
  databaseProblemMessage,
  describeCredentialFlags,
  proposeEvents,
} from "@penntools/tool-pass-it-on";
import { CalendarFormatError, MAX_UPLOAD_BYTES, calendarRows } from "@penntools/tool-pass-it-on/imports";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { maybeDb } from "../../db";

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();
  const sql = maybeDb();
  if (!sql) return Response.json({ error: "Pass It On's database is not configured." }, { status: 500 });
  const ai = await getAI("pass-it-on");
  if (!ai) return signInRequired();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: `That file is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` }, { status: 400 });

  const provider = String(form.get("provider") ?? "");
  const available = await ai.providers();
  const chosen = available.find((p) => p === provider);
  if (!chosen) return Response.json({ error: "Add an AI key in Settings to read calendars.", kind: "missing_key" }, { status: 400 });

  try {
    const rows = await calendarRows(file.name, new Uint8Array(await file.arrayBuffer()));
    if (rows.length === 0) return Response.json({ status: "empty" });

    const check = checkUploadForCredentials(file.name, rows.map((r) => r.text));
    if (check.status === "blocked") return Response.json({ status: "blocked", reason: check.reason });
    if (check.status === "needs_confirmation" && form.get("confirm") !== "yes") {
      return Response.json({ status: "needs_confirmation", message: describeCredentialFlags(check.flags) });
    }

    const proposals = await proposeEvents(ai, chosen, rows);
    const importId = await createCalendarImport(sql, { filename: file.name, uploadedBy: user.id, proposals });
    return Response.json({ status: "saved", importId, proposals: proposals.filter((p) => !p.skipReason).length, skipped: proposals.filter((p) => p.skipReason).length });
  } catch (error) {
    if (error instanceof CalendarFormatError) return Response.json({ error: error.message }, { status: 400 });
    if (isAIError(error)) return Response.json({ error: error.message, kind: error.kind }, { status: 502 });
    const problem = databaseProblem(error);
    if (problem) return Response.json({ error: databaseProblemMessage(problem) }, { status: 503 });
    throw error;
  }
}
