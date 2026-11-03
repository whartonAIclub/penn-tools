// POST /tools/recruiting-helper/score — scores whatever was pasted (a job
// posting or a person's profile; the AI tells which) against the signed-in
// user's saved profile, and saves it to their list.
//
// Body: { provider, text, screenshots, link? }; screenshots are base64 images
// (see Screenshot in the tool's scoring.ts). A route rather than a server
// action, since Next.js refuses server action requests over 1 MB and
// screenshots are bigger. A body over MAX_REQUEST_BYTES gets a 413.
//
// Responds { ok: true, item, replaced } or { ok: false, error: { kind?, message } },
// where kind is the AIError kind when the AI API failed.

import type { NextRequest } from "next/server";
import { AI_PROVIDERS, isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  MAX_REQUEST_BYTES,
  UnclearPasteError,
  checkPaste,
  cleanLink,
  getProfile,
  reviewPaste,
  saveItem,
  type NewItem,
  type Paste,
} from "@penntools/tool-recruiting-helper";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { fail, readJsonBody } from "../readBody";

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();

  const sql = toolSql("recruitinghelper");
  if (!sql) return fail("Recruiting Helper's database is not configured.", 500);

  const body = await readJsonBody(req, MAX_REQUEST_BYTES);
  if (!body) return fail("That's too much to score at once. Use fewer or smaller screenshots.", 413);

  const { provider } = body;
  if (!AI_PROVIDERS.includes(provider as AIProvider)) return fail("Pick an AI provider.", 400);
  const problem = checkPaste(body, "a job posting or a LinkedIn profile");
  if (problem) return fail(problem, 400);
  const link = cleanLink(body["link"]);
  if (link === undefined) return fail("The link must be a web address starting with https://.", 400);

  const profile = await getProfile(sql, user.id);
  if (!profile) return fail("Save your profile first.", 400);

  // Only the fields checkPaste checked, whatever else the browser sent.
  const paste: Paste = {
    text: body["text"] as string,
    screenshots: (body["screenshots"] as Paste["screenshots"]).map(({ mediaType, data }) => ({ mediaType, data })),
  };

  let scored: NewItem;
  try {
    // The link is the posting's, or the person's LinkedIn profile.
    scored = { ...(await reviewPaste((await getAI())!, provider as AIProvider, profile, paste)), link };
  } catch (error) {
    if (error instanceof UnclearPasteError) return fail(error.message, 422);
    if (isAIError(error)) return Response.json({ ok: false, error: error.toJSON() }, { status: 502 });
    throw error;
  }

  if (scored.kind === "contact" && !scored.name) {
    return fail(
      "That looks like a person's profile, but I couldn't find their name. Include the top of the profile, where the name is.",
      422,
    );
  }

  const { item, replaced } = await saveItem(sql, user.id, scored);
  return Response.json({ ok: true, item, replaced });
}
