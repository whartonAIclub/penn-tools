// What each person shares when they approve a booking: a phone number, and
// for whoever hosts the care, the address. They're kept until both approve and
// then shown only to those two people (requests.ts, getRequestView).

import { z } from "@penntools/core/ai";
import type { Role } from "./booking.js";
import type { Checked, RequestDraft } from "./request.js";
import { LIMITS } from "./survey.js";

/** Who gives the address: the owner when care happens at their place, the sitter for boarding. */
export function addressFrom(careType: RequestDraft["careType"]): Role {
  return careType === "boarding" ? "sitter" : "owner";
}

export const Handoff = z.object({
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((p) => p.replace(/\D/g, "").length >= 10, "Add a phone number your sitter or owner can text."),
  address: z.string().trim().max(LIMITS.shortText).nullable(),
});
export type Handoff = z.infer<typeof Handoff>;

/** The handoff, or the first thing wrong with it. `needsAddress` is true for whoever hosts the care. */
export function checkHandoff(input: unknown, needsAddress: boolean): Checked<Handoff> {
  const result = Handoff.safeParse(input);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Check your phone number." };
  if (needsAddress && (result.data.address ?? "").length < 5) return { ok: false, error: "Add the address where the care happens." };
  return { ok: true, value: { phone: result.data.phone, address: needsAddress ? result.data.address : null } };
}
