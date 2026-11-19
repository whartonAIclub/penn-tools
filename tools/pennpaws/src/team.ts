// What the PennPaws team sees and can do: who has joined, how requests and
// offers are going, and what members have reported, with two levers for
// safety (hide a request, pause a member). The platform has no admin role for
// tools, so the team is a short list of Penn emails here, reviewed in code
// like everything else. Members are told at setup that the team can see this.

import { z } from "@penntools/core/ai";
import type { Sql } from "postgres";
import { fitOf } from "./match.js";
import type { MemberRole } from "./profile.js";
import type { Checked } from "./request.js";
import { PennPawsError, UUID_RE, firstName } from "./requests.js";
import { LIMITS, type Option } from "./survey.js";
import type { RequestStatus } from "./booking.js";

/** The team's Penn emails. Add a teammate's here; anyone else never sees team data. */
export const TEAM_EMAILS: readonly string[] = ["lu16@wharton.upenn.edu", "li717@wharton.upenn.edu"];

/** Whether this sign-in email belongs to the team. `allowLocalTest` lets the local test user in under `pnpm dev`. */
export function isTeamEmail(email: string | null | undefined, allowLocalTest: boolean): boolean {
  const normalized = email?.trim().toLowerCase();
  if (normalized && TEAM_EMAILS.includes(normalized)) return true;
  return allowLocalTest && normalized === "dev@localhost";
}

// ── Reports ──────────────────────────────────────────────────────────────────

export const REPORT_REASONS = [
  { value: "unsafe", label: "Unsafe or suspicious" },
  { value: "fake", label: "Not a real request or person" },
  { value: "rude", label: "Rude or harassing" },
  { value: "other", label: "Something else" },
] as const satisfies readonly Option[];
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const ReportInput = z
  .object({
    kind: z.enum(["request", "offer"]),
    /** The request's id, or for an offer, the offer's id. */
    targetId: z.string().regex(UUID_RE, "That doesn't exist."),
    reason: z.enum(REPORT_REASONS.map((r) => r.value) as [ReportReason, ...ReportReason[]]),
    details: z.string().trim().max(LIMITS.message).nullable(),
  })
  .refine((r) => r.reason !== "other" || !!r.details, { message: "Say what happened.", path: ["details"] });
export type ReportInput = z.infer<typeof ReportInput>;

export function checkReport(input: unknown): Checked<ReportInput> {
  const result = ReportInput.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Check the report and try again." };
}

/** Files a report about a request (its owner) or an offer (its sitter). Reporting the same thing twice updates the first report. */
export async function fileReport(sql: Sql, reporterId: string, report: ReportInput): Promise<void> {
  const [target] =
    report.kind === "request"
      ? await sql<{ request_id: string; subject_id: string }[]>`SELECT id AS request_id, owner_id AS subject_id FROM requests WHERE id = ${report.targetId}`
      : await sql<{ request_id: string; subject_id: string }[]>`SELECT request_id, sitter_id AS subject_id FROM offers WHERE id = ${report.targetId}`;
  if (!target) throw new PennPawsError("That doesn't exist anymore.");
  if (target.subject_id === reporterId) throw new PennPawsError("You can't report yourself.");
  await sql`
    INSERT INTO reports (reporter_id, target_kind, request_id, subject_id, reason, details)
    VALUES (${reporterId}, ${report.kind}, ${target.request_id}, ${target.subject_id}, ${report.reason}, ${report.details})
    ON CONFLICT (reporter_id, target_kind, request_id, subject_id)
    DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, resolved_at = NULL, created_at = NOW()
  `;
}

// ── Match tracking ───────────────────────────────────────────────────────────

/** Keeps the rules' score for the job the sitter just offered on. */
export async function recordMatchScore(sql: Sql, requestId: string, sitterId: string, score: number): Promise<void> {
  await sql`UPDATE offers SET match_score = ${Math.round(score)} WHERE request_id = ${requestId} AND sitter_id = ${sitterId}`;
}

// ── What the team sees ───────────────────────────────────────────────────────

export interface TeamOverview {
  members: { total: number; owner: number; sitter: number; pals: number; paused: number; joinedThisWeek: number };
  requests: Record<RequestStatus, number> & { total: number; hidden: number };
  offers: { total: number; scored: number; onGoodMatches: number; averageScore: number | null };
  openReports: number;
}

export async function teamOverview(sql: Sql): Promise<TeamOverview> {
  const [m] = await sql<{ total: number; owner: number; sitter: number; pals: number; paused: number; week: number }[]>`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE role = 'owner')::int AS owner,
           COUNT(*) FILTER (WHERE role = 'sitter')::int AS sitter,
           COUNT(*) FILTER (WHERE role = 'pals')::int AS pals,
           COUNT(*) FILTER (WHERE paused_at IS NOT NULL)::int AS paused,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS week
    FROM members
  `;
  const statuses = await sql<{ status: RequestStatus; n: number; hidden: number }[]>`
    SELECT status, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE hidden_at IS NOT NULL)::int AS hidden FROM requests GROUP BY status
  `;
  const requests = { open: 0, matched: 0, agreed: 0, completed: 0, cancelled: 0, total: 0, hidden: 0 } as TeamOverview["requests"];
  for (const s of statuses) {
    requests[s.status] = s.n;
    requests.total += s.n;
    requests.hidden += s.hidden;
  }
  const [o] = await sql<{ total: number; scored: number; good: number; average: number | null }[]>`
    SELECT COUNT(*)::int AS total,
           COUNT(match_score)::int AS scored,
           COUNT(*) FILTER (WHERE match_score >= 62)::int AS good,
           ROUND(AVG(match_score))::int AS average
    FROM offers WHERE status <> 'withdrawn'
  `;
  const [r] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM reports WHERE resolved_at IS NULL`;
  return {
    members: { total: m?.total ?? 0, owner: m?.owner ?? 0, sitter: m?.sitter ?? 0, pals: m?.pals ?? 0, paused: m?.paused ?? 0, joinedThisWeek: m?.week ?? 0 },
    requests,
    offers: { total: o?.total ?? 0, scored: o?.scored ?? 0, onGoodMatches: o?.good ?? 0, averageScore: o?.average ?? null },
    openReports: r?.n ?? 0,
  };
}

export interface TeamMember {
  userId: string;
  firstName: string;
  school: string;
  role: MemberRole;
  area: string | null;
  joinedOn: string;
  paused: boolean;
  requests: number;
  offers: number;
  reports: number;
  /** One of the fake people from the seed script. */
  test: boolean;
}

/** Everyone who has finished setup, newest first. First names only; the team doesn't need more to keep things safe. */
export async function listTeamMembers(sql: Sql): Promise<TeamMember[]> {
  const rows = await sql<
    { user_id: string; name: string; school: string; role: MemberRole; area: string | null; joined: string; paused: boolean; requests: number; offers: number; reports: number }[]
  >`
    SELECT m.user_id, m.name, m.school, m.role, m.area, to_char(m.created_at, 'YYYY-MM-DD') AS joined, m.paused_at IS NOT NULL AS paused,
           (SELECT COUNT(*)::int FROM requests r WHERE r.owner_id = m.user_id) AS requests,
           (SELECT COUNT(*)::int FROM offers o WHERE o.sitter_id = m.user_id) AS offers,
           (SELECT COUNT(*)::int FROM reports p WHERE p.subject_id = m.user_id AND p.resolved_at IS NULL) AS reports
    FROM members m
    ORDER BY m.created_at DESC
    LIMIT 500
  `;
  return rows.map((row) => ({
    userId: row.user_id,
    firstName: firstName(row.name),
    school: row.school,
    role: row.role,
    area: row.area,
    joinedOn: row.joined,
    paused: row.paused,
    requests: row.requests,
    offers: row.offers,
    reports: row.reports,
    test: row.user_id.startsWith("seed-"),
  }));
}

export interface TeamReport {
  id: string;
  kind: "request" | "offer";
  reason: ReportReason;
  details: string | null;
  reportedOn: string;
  requestId: string;
  petName: string;
  requestHidden: boolean;
  subject: { userId: string; firstName: string; paused: boolean };
  reporterFirstName: string;
}

/** Reports the team hasn't resolved yet, newest first. */
export async function listOpenReports(sql: Sql): Promise<TeamReport[]> {
  const rows = await sql<
    {
      id: string;
      target_kind: "request" | "offer";
      reason: ReportReason;
      details: string | null;
      reported: string;
      request_id: string;
      pet_name: string;
      hidden: boolean;
      subject_id: string;
      subject_name: string | null;
      subject_paused: boolean;
      reporter_name: string | null;
    }[]
  >`
    SELECT p.id, p.target_kind, p.reason, p.details, to_char(p.created_at, 'YYYY-MM-DD') AS reported,
           p.request_id, r.pet_name, r.hidden_at IS NOT NULL AS hidden,
           p.subject_id, s.paused_at IS NOT NULL AS subject_paused,
           -- Names come from setup, else from the request or offer they made.
           COALESCE(s.name, CASE WHEN p.target_kind = 'request' THEN r.owner_name
             ELSE (SELECT o.sitter_name FROM offers o WHERE o.request_id = p.request_id AND o.sitter_id = p.subject_id) END) AS subject_name,
           COALESCE(w.name, (SELECT q.owner_name FROM requests q WHERE q.owner_id = p.reporter_id LIMIT 1),
             (SELECT o.sitter_name FROM offers o WHERE o.sitter_id = p.reporter_id LIMIT 1)) AS reporter_name
    FROM reports p
    JOIN requests r ON r.id = p.request_id
    LEFT JOIN members s ON s.user_id = p.subject_id
    LEFT JOIN members w ON w.user_id = p.reporter_id
    WHERE p.resolved_at IS NULL
    ORDER BY p.created_at DESC
    LIMIT 200
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.target_kind,
    reason: row.reason,
    details: row.details,
    reportedOn: row.reported,
    requestId: row.request_id,
    petName: row.pet_name,
    requestHidden: row.hidden,
    subject: { userId: row.subject_id, firstName: firstName(row.subject_name ?? ""), paused: row.subject_paused },
    reporterFirstName: firstName(row.reporter_name ?? ""),
  }));
}

export async function resolveReport(sql: Sql, reportId: string): Promise<void> {
  if (!UUID_RE.test(reportId)) throw new PennPawsError("That report doesn't exist.");
  await sql`UPDATE reports SET resolved_at = NOW() WHERE id = ${reportId}`;
}

/** Hides a request from Find (its owner still sees it), or shows it again. */
export async function setRequestHidden(sql: Sql, requestId: string, hidden: boolean): Promise<void> {
  if (!UUID_RE.test(requestId)) throw new PennPawsError("That request doesn't exist.");
  await sql`UPDATE requests SET hidden_at = ${hidden ? sql`NOW()` : null}, updated_at = NOW() WHERE id = ${requestId}`;
}

/** Pauses a member (their open requests drop out of Find and they can't post, offer or message), or unpauses them. */
export async function setMemberPaused(sql: Sql, userId: string, paused: boolean): Promise<void> {
  await sql`UPDATE members SET paused_at = ${paused ? sql`NOW()` : null} WHERE user_id = ${userId}`;
}
