// The booking rules: which status a request moves to on each action, and who
// may take it. Storage functions call these before every status change, so
// the rules live in one place and are tested without a database.

export type RequestStatus = "open" | "matched" | "agreed" | "completed" | "cancelled";
export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn";
export type Role = "owner" | "sitter";

export type RequestAction = "accept_offer" | "both_approved" | "cancel" | "complete";

const TRANSITIONS: Record<RequestAction, { from: readonly RequestStatus[]; to: RequestStatus; by: readonly Role[] }> = {
  accept_offer: { from: ["open"], to: "matched", by: ["owner"] },
  both_approved: { from: ["matched"], to: "agreed", by: ["owner", "sitter"] },
  cancel: { from: ["open", "matched"], to: "cancelled", by: ["owner"] },
  complete: { from: ["agreed"], to: "completed", by: ["owner", "sitter"] },
};

/** The status after `action`, or null when it isn't allowed from `status` for `role`. */
export function nextStatus(status: RequestStatus, action: RequestAction, role: Role): RequestStatus | null {
  const rule = TRANSITIONS[action];
  return rule.from.includes(status) && rule.by.includes(role) ? rule.to : null;
}

/** The statuses a request may be in when `action` runs, for guarded SQL updates. */
export function allowedFrom(action: RequestAction): readonly RequestStatus[] {
  return TRANSITIONS[action].from;
}

export interface Approvals {
  ownerApprovedAt: string | null;
  sitterApprovedAt: string | null;
}

export function bothApproved(approvals: Approvals): boolean {
  return approvals.ownerApprovedAt !== null && approvals.sitterApprovedAt !== null;
}

/** Contact details are shared only once a booking is agreed or done. */
export function canSeeContacts(status: RequestStatus): boolean {
  return status === "agreed" || status === "completed";
}
