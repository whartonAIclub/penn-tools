// The Ask tab: questions answered from the library, each answer citing its
// source passages. Answers need an AI key (and OpenAI embeddings for search);
// without a key the tab still shows the passages that contain the question's
// words.

import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_SEARCH_QUERY_LENGTH, listSources } from "@penntools/tool-pass-it-on";
import { getAI } from "@/lib/ai";
import { db } from "../db";
import { AskLibrary } from "./AskLibrary";

export default async function AskPage() {
  const providers = await (await getAI("pass-it-on"))!.providers();
  const tags = [...new Set((await listSources(db())).flatMap((s) => s.tags))].sort();
  return <AskLibrary providers={providers} labels={PROVIDER_LABELS} tags={tags} maxLength={MAX_SEARCH_QUERY_LENGTH} />;
}
