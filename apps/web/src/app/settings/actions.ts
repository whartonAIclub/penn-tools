"use server";

// Server actions for the settings page. Their arguments come straight from the
// browser, so each one checks them before use. Keys are never logged or
// returned; only SavedApiKey (the last four characters) goes back.
//
// Each action revalidates /settings: Next reuses a visited page when the user
// goes back or forward, which would otherwise show the key status from before
// the change.

import { revalidatePath } from "next/cache";
import type { ApiKeyProvider, SavedApiKey } from "@penntools/core/types";
import { checkApiKey } from "@penntools/platform/ai";
import { getCurrentUser } from "@/lib/auth";
import { userApiKeys, logger } from "@/lib/container";
import { API_KEY_PROVIDERS, apiKeyFormatError, isApiKeyProvider } from "./apiKeyProviders";

export type SaveApiKeyResult = { saved: SavedApiKey } | { error: string };

/** Checks the key with its provider, then saves it, replacing any saved key. */
export async function saveApiKey(provider: ApiKeyProvider, key: string): Promise<SaveApiKeyResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to save API keys." };
  if (!isApiKeyProvider(provider) || typeof key !== "string") return { error: "Invalid request." };

  const trimmed = key.trim();
  const formatError = apiKeyFormatError(provider, trimmed);
  if (formatError) return { error: formatError };

  const { label } = API_KEY_PROVIDERS[provider];
  try {
    if ((await checkApiKey(provider, trimmed)) === "invalid") {
      return { error: `${label} didn't accept this key. Check that you copied all of it and that it hasn't been revoked.` };
    }
  } catch (error) {
    logger.error(`[settings] Couldn't check a ${provider} API key`, error);
    return { error: `Couldn't reach ${label} to check this key. Try again in a moment.` };
  }

  const saved = await userApiKeys.set(user.id, provider, trimmed);
  revalidatePath("/settings");
  return { saved };
}

export async function removeApiKey(provider: ApiKeyProvider): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to remove API keys." };
  if (!isApiKeyProvider(provider)) return { error: "Invalid request." };

  await userApiKeys.remove(user.id, provider);
  revalidatePath("/settings");
  return {};
}
