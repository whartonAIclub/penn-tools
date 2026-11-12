// POST /tools/wemba-sync/extract — reads a class weekend schedule PDF and saves it
//
// Body: { provider, filename, data }, the PDF as base64 (no data: prefix). A
// route rather than a server action, since a PDF can be larger than server
// actions accept. A body over MAX_REQUEST_BYTES gets a 413; a file that isn't
// a PDF, doesn't open or has over MAX_PDF_PAGES pages, a 400. The weekend is
// saved for the signed-in student, replacing their earlier schedule for the
// same weekend. Replies { schedule, saved }, where saved is the SavedWeekend,
// or null if it couldn't be saved (no dated items, or storage isn't set up;
// the page still shows it), or { error: { message, kind? } }, where kind is
// the AIError's.

import type { NextRequest } from "next/server";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  MAX_PDF_PAGES,
  applyCorrections,
  checkUpload,
  extractWeekend,
  saveWeekend,
  type SavedWeekend,
  type WeekendSchedule,
} from "@penntools/tool-wemba-sync";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { db } from "../db";
import { failure, pageCount, readBody, today } from "../upload";

/** Saves the weekend for the student; null if it can't be (see the top of this file). */
async function save(userId: string, filename: string, schedule: WeekendSchedule): Promise<SavedWeekend | null> {
  const sql = db();
  if (!sql) return null;
  try {
    return await saveWeekend(sql, userId, filename, schedule);
  } catch (error) {
    console.error("[wemba-sync] saving a weekend failed", error);
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();
  const ai = await getAI();
  if (!ai) return signInRequired();

  const text = await readBody(req);
  if (text === null) return failure("This file is too large to read.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return failure("Send the schedule as JSON.", 400);
  }
  const problem = checkUpload(body);
  if (problem) return failure(problem, 400);
  const { provider, filename, data } = body as { provider: AIProvider; filename: string; data: string };

  const pages = await pageCount(data);
  if (pages === null) return failure(`${filename} couldn't be read as a PDF.`, 400);
  if (pages > MAX_PDF_PAGES) return failure(`${filename} has ${pages} pages; schedules can have at most ${MAX_PDF_PAGES}.`, 400);

  try {
    // The AI API checks provider itself.
    // Then fill in what the PDF leaves out (corrections.ts).
    const schedule = applyCorrections(await extractWeekend(ai, provider, { filename, data }, today()));
    return Response.json({ schedule, saved: await save(user.id, filename, schedule) });
  } catch (error) {
    if (isAIError(error)) return failure(error.message, 502, error.kind);
    throw error;
  }
}
