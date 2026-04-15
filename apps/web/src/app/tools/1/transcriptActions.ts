"use server";

import { persistCourses, saveTranscriptMeta } from "./transcriptPersistence";
import type { SavedCourse, TranscriptMeta } from "./transcriptPersistence";

export async function saveTranscript(courses: SavedCourse[], meta: TranscriptMeta): Promise<void> {
  persistCourses(courses);
  saveTranscriptMeta(meta);
}
