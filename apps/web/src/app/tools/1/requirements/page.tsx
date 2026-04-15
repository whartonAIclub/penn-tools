import Link from "next/link";
import { loadSavedCourses } from "../transcriptPersistence";
import type { SavedCourse } from "../transcriptPersistence";
import { loadWaivers } from "../waiversPersistence";
import type { WaiverEntry } from "../waiversPersistence";
import { FIXED_CORE, FLEXIBLE_CORE, TOTAL_CU_REQUIRED, WHARTON_CU_REQUIRED } from "../requirementsData";
import type { RequirementGroup } from "../requirementsData";

// Converts waivers into synthetic SavedCourse entries so mapping logic works uniformly
function waiverToCourse(w: WaiverEntry): SavedCourse {
  return {
    courseId: w.courseId,
    title: w.courseId,
    credits: 1.0,
    grade: w.type === "waived" ? "Waived" : "Substituted",
    term: null,
    crossListedAs: [],
    officialTitle: null,
    officialCredits: 1.0,
    department: null,
  };
}

// ── Requirement mapping ────────────────────────────────────────────────────────

interface RequirementStatus {
  req: RequirementGroup;
  met: boolean;
  metBy: SavedCourse | null;
  cuAccumulated: number;
  metByCourses: SavedCourse[];
}

function mapRequirements(courses: SavedCourse[], waivers: WaiverEntry[]): RequirementStatus[] {
  const waiverCourses = waivers.map(waiverToCourse);
  const allCourses = [...courses, ...waiverCourses];
  const courseMap = new Map(allCourses.map((c) => [c.courseId, c]));

  return [...FIXED_CORE, ...FLEXIBLE_CORE].map((req) => {
    if (req.type === "cumulative") {
      const metByCourses = req.options
        .map((opt) => courseMap.get(opt))
        .filter((c): c is SavedCourse => !!c);
      const cuAccumulated = metByCourses.reduce(
        (s, c) => s + (c.officialCredits ?? c.credits ?? 0),
        0
      );
      return {
        req,
        met: cuAccumulated >= req.cuNeeded,
        metBy: metByCourses[0] ?? null,
        cuAccumulated,
        metByCourses,
      };
    }

    const metBy =
      req.options.map((opt) => courseMap.get(opt)).find((c): c is SavedCourse => !!c) ?? null;
    return {
      req,
      met: !!metBy,
      metBy,
      cuAccumulated: metBy ? (metBy.officialCredits ?? metBy.credits ?? 0) : 0,
      metByCourses: metBy ? [metBy] : [],
    };
  });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RequirementsPage() {
  const courses = loadSavedCourses();
  const waivers = loadWaivers();
  const statuses = mapRequirements(courses, waivers);

  const totalCU = courses.reduce((s, c) => s + (c.officialCredits ?? c.credits ?? 0), 0);
  const fixedStatuses = statuses.filter((s) => s.req.category === "Fixed Core");
  const flexStatuses = statuses.filter((s) => s.req.category === "Flexible Core");
  const fixedMet = fixedStatuses.filter((s) => s.met).length;
  const flexMet = flexStatuses.filter((s) => s.met).length;
  const allCoreMet = fixedMet === fixedStatuses.length && flexMet === flexStatuses.length;

  if (courses.length === 0) {
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f4f6fb" }}>
        <Nav />
        <div style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No transcript on file</div>
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>
            Upload your transcript first so we can map your courses to graduation requirements.
          </div>
          <Link href="/tools/1" style={btnPrimary}>
            Upload transcript →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f4f6fb" }}>
      <Nav />

      <div style={{ maxWidth: 860, margin: "40px auto 80px", padding: "0 24px" }}>

        {/* Summary stats */}
        <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
          <StatCard
            value={`${totalCU % 1 === 0 ? totalCU : totalCU.toFixed(1)} / ${TOTAL_CU_REQUIRED}`}
            label="Total CU toward degree"
            highlight={totalCU >= TOTAL_CU_REQUIRED}
          />
          <StatCard
            value={`${fixedMet} / ${fixedStatuses.length}`}
            label="Fixed core complete"
            highlight={fixedMet === fixedStatuses.length}
          />
          <StatCard
            value={`${flexMet} / ${flexStatuses.length}`}
            label="Flexible core complete"
            highlight={flexMet === flexStatuses.length}
          />
          <StatCard
            value={allCoreMet ? "On track" : "In progress"}
            label="Core curriculum"
            highlight={allCoreMet}
          />
        </div>

        {/* Fixed Core */}
        <Section title="Fixed Core" subtitle="Required for all Wharton MBA students — no substitutions.">
          {fixedStatuses.map((s) => (
            <RequirementRow key={s.req.id} status={s} />
          ))}
        </Section>

        {/* Flexible Core */}
        <Section title="Flexible Core" subtitle="Complete one course from each category below.">
          {flexStatuses.map((s) => (
            <RequirementRow key={s.req.id} status={s} />
          ))}
        </Section>

        {/* Next step: Major Requirements */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Ready for the next step?</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>See how your courses map to your specific major's requirements.</div>
          </div>
          <Link
            href="/tools/1/requirements/majors"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 20px", background: "#011F5B", color: "#fff",
              borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Major Requirements →
          </Link>
        </div>

        {/* Re-upload link */}
        <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#9ca3af" }}>
          Transcript changed?{" "}
          <Link href="/tools/1" style={{ color: "#011F5B", fontWeight: 600, textDecoration: "none" }}>
            Re-upload here →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Nav() {
  return (
    <div style={{ background: "#011F5B", height: 56, display: "flex", alignItems: "center", padding: "0 32px", gap: 12 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PennTools</span>
      <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
      <Link href="/tools/1" style={{ fontSize: 14, color: "#93b4e0", textDecoration: "none" }}>CourseMatch Assist</Link>
      <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
      <span style={{ fontSize: 14, color: "#fff" }}>Graduation Requirements</span>
    </div>
  );
}

function StatCard({ value, label, highlight }: { value: string; label: string; highlight: boolean }) {
  return (
    <div style={{
      flex: 1,
      background: "#fff",
      border: `1px solid ${highlight ? "#bbf7d0" : "#e5e7eb"}`,
      borderRadius: 10,
      padding: "16px 20px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: highlight ? "#166534" : "#011F5B", lineHeight: 1, marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
        {label}
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, marginBottom: 24, overflow: "hidden" }}>
      <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function RequirementRow({ status }: { status: RequirementStatus }) {
  const { req, met, metBy, cuAccumulated, metByCourses } = status;

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 16,
      padding: "16px 28px",
      borderBottom: "1px solid #f9fafb",
    }}>
      {/* Status icon */}
      <div style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
        marginTop: 1,
        background: met ? "#dcfce7" : "#fef2f2",
        color: met ? "#166534" : "#dc2626",
      }}>
        {met ? "✓" : "✗"}
      </div>

      {/* Requirement info */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
          {req.label}
        </div>
        {!met && req.optionLabels && (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            {req.optionLabels.join("  ·  ")}
          </div>
        )}
      </div>

      {/* Right side: what satisfied it (or what's needed) */}
      <div style={{ textAlign: "right", flexShrink: 0, maxWidth: 260 }}>
        {met ? (
          req.type === "cumulative" ? (
            <div>
              {metByCourses.map((c) => (
                <div key={c.courseId} style={{ fontSize: 12, color: "#374151" }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#011F5B" }}>
                    {c.courseId}
                  </span>{" "}
                  {c.officialTitle ?? c.title}
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                {cuAccumulated.toFixed(1)} / {req.cuNeeded} CU
              </div>
            </div>
          ) : (
            metBy && (
              <div>
                <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: 13, color: "#011F5B" }}>
                  {metBy.courseId}
                </span>
                <div style={{ fontSize: 12, color: "#374151" }}>{metBy.officialTitle ?? metBy.title}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  {(metBy.officialCredits ?? metBy.credits) != null
                    ? `${metBy.officialCredits ?? metBy.credits} CU`
                    : ""}{" "}
                  {metBy.grade ? `· ${metBy.grade}` : ""}
                </div>
              </div>
            )
          )
        ) : (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 4,
            background: "#fef2f2",
            color: "#dc2626",
          }}>
            Not yet completed
          </span>
        )}
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 24px",
  background: "#011F5B",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
};
