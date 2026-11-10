// The credential guard for uploads. The "Pub Email & Social Accounts" document
// must never be uploaded, and anything that looks like it holds a password
// needs a person's confirmation first. Findings never include the secret
// itself: only where it was found and which word triggered it.

/** Matches the filename of the credentials document, however it's punctuated. */
const BLOCKED_FILENAME = /pub\s*email\s*(?:&|and|\+)?\s*social\s*accounts?/i;
/** "password", "passwords", "passwd", or "pass:" (but not "bypass:" or "pass the"). */
const CREDENTIAL_WORD = /\bpass(?:words?|wd)\b|\bpass\s*:/gi;

export interface CredentialFlag {
  /** Position of the excerpt that contains it, in the order given. */
  excerptIndex: number;
  /** The word that triggered the flag, e.g. "password". */
  term: string;
}

export type UploadCheck =
  /** Never allowed. */
  | { status: "blocked"; reason: string }
  /** Allowed only after a person confirms the file holds no credentials. */
  | { status: "needs_confirmation"; flags: CredentialFlag[] }
  | { status: "ok" };

/** Whether an upload may go ahead: checks the filename, then every excerpt's text. */
export function checkUploadForCredentials(filename: string, excerptTexts: string[]): UploadCheck {
  if (BLOCKED_FILENAME.test(filename)) {
    return {
      status: "blocked",
      reason: "This looks like the Pub Email & Social Accounts document, which holds logins and must never be uploaded.",
    };
  }
  const flags: CredentialFlag[] = [];
  excerptTexts.forEach((text, excerptIndex) => {
    const terms = new Set([...text.matchAll(CREDENTIAL_WORD)].map((m) => m[0].toLowerCase().replace(/\s+/g, "")));
    for (const term of terms) flags.push({ excerptIndex, term });
  });
  return flags.length > 0 ? { status: "needs_confirmation", flags } : { status: "ok" };
}

/** A short message for the person deciding whether to confirm. */
export function describeCredentialFlags(flags: CredentialFlag[]): string {
  const places = new Set(flags.map((f) => f.excerptIndex)).size;
  const terms = [...new Set(flags.map((f) => `"${f.term}"`))].join(", ");
  return `This file mentions ${terms} in ${places} place${places === 1 ? "" : "s"}. Check it holds no logins before uploading.`;
}
