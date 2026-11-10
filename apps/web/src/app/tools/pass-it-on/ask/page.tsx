// The Ask tab: questions answered from the library, each answer citing its
// source passages. Needs an AI key; searching also needs OpenAI embeddings.

import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_SEARCH_QUERY_LENGTH, listSources } from "@penntools/tool-pass-it-on";
import { getAI } from "@/lib/ai";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { db } from "../db";
import { AskLibrary } from "./AskLibrary";

export default async function AskPage() {
  const providers = await (await getAI())!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="Pass It On" />;

  const tags = [...new Set((await listSources(db())).flatMap((s) => s.tags))].sort();
  return <AskLibrary providers={providers} labels={PROVIDER_LABELS} tags={tags} maxLength={MAX_SEARCH_QUERY_LENGTH} />;
}
