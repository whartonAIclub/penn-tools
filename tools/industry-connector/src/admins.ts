// Who can load data into the tool: its own admins, listed here, and PennTools
// site admins. Tool admins are PennTools user ids (random codes, not names or
// emails). To add yourself: sign in to the live PennTools site, open /api/me,
// and add the "id" it shows below.
//
// Empty means only site admins can upload: the safe default. Locally, the
// development user counts as a site admin, so the upload page can be tried.

export const TOOL_ADMIN_IDS: readonly string[] = [
  // Avvalzameer Bhatia: (add live user id)
  // Yolanda Ye: (add live user id)
  // Shatakshi Mohan: (add live user id)
];

/**
 * Whether this user may upload data: a tool admin, or a PennTools site admin.
 * `isAdmin` is the platform's check from @/lib/admin, asked only when the
 * tool-admin check fails; an error from it counts as no.
 */
export async function canManageData(userId: string | null, isAdmin: () => Promise<boolean>): Promise<boolean> {
  if (userId === null) return false;
  if (TOOL_ADMIN_IDS.includes(userId)) return true;
  return isAdmin().catch(() => false);
}
