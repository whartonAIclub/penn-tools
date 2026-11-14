// Adding a file to the library: read it, run the credential guard over its
// name (and the names inside a zip) and its text, save it with its tags, then
// embed it so it can be searched. Nothing is saved when the guard blocks it or
// is waiting for a person's confirmation.

import type { EmbeddingProvider } from "@penntools/core/embeddings";
import type { Sql } from "postgres";
import { checkUploadForCredentials, describeCredentialFlags } from "../credentials.js";
import { embedLibrary } from "../library.js";
import { saveImport } from "../storage.js";
import { documentExcerpts } from "./documents.js";

/** Largest file the library accepts. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface LibraryUpload {
  sql: Sql;
  /** Null when no OpenAI key is available: the file is saved but can't be searched yet. */
  embeddings: EmbeddingProvider | null;
  filename: string;
  data: Uint8Array;
  tags: string[];
  eventId: string | null;
  uploadedBy: string;
  /** A person has checked the file holds no logins, after a "needs_confirmation" result. */
  confirmedNoCredentials: boolean;
}

export type LibraryUploadResult =
  | { status: "blocked"; reason: string }
  | { status: "needs_confirmation"; message: string }
  | { status: "empty"; skipped: { file: string; reason: string }[] }
  | {
      status: "saved";
      sourceId: string;
      excerpts: number;
      /** False when it couldn't be embedded, so it isn't searchable yet. */
      searchable: boolean;
      skipped: { file: string; reason: string }[];
    };

/** Reads, checks, saves and embeds one uploaded file. */
export async function uploadLibraryFile(upload: LibraryUpload): Promise<LibraryUploadResult> {
  if (upload.data.byteLength > MAX_UPLOAD_BYTES) {
    return { status: "blocked", reason: `That file is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }
  const nameCheck = checkUploadForCredentials(upload.filename, []);
  if (nameCheck.status === "blocked") return nameCheck;

  const { excerpts, skipped } = await documentExcerpts(upload.filename, upload.data);
  if (excerpts.length === 0) return { status: "empty", skipped };

  // A zip holds many files: check each one's name too.
  for (const file of new Set(excerpts.map((e) => e.meta.file).filter((f): f is string => Boolean(f)))) {
    const inner = checkUploadForCredentials(file.split("/").pop() ?? file, []);
    if (inner.status === "blocked") return { status: "blocked", reason: `${upload.filename} contains "${file}". ${inner.reason}` };
  }

  const check = checkUploadForCredentials(upload.filename, excerpts.map((e) => e.text));
  if (check.status === "needs_confirmation" && !upload.confirmedNoCredentials) {
    return { status: "needs_confirmation", message: describeCredentialFlags(check.flags) };
  }

  const sourceId = await saveImport(
    upload.sql,
    { kind: "drive", filename: upload.filename, uploadedBy: upload.uploadedBy, tags: upload.tags, eventId: upload.eventId },
    excerpts,
  );

  let searchable = false;
  if (upload.embeddings) {
    try {
      await embedLibrary(upload.sql, upload.embeddings, sourceId);
      searchable = true;
    } catch {
      // Saved but not embedded; embedLibrary(sql, embeddings) catches up later.
    }
  }
  return { status: "saved", sourceId, excerpts: excerpts.length, searchable, skipped };
}
