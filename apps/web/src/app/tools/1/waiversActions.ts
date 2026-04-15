"use server";

import { persistWaivers } from "./waiversPersistence";
import type { WaiverEntry } from "./waiversPersistence";

export async function saveWaivers(waivers: WaiverEntry[]): Promise<void> {
  persistWaivers(waivers);
}
