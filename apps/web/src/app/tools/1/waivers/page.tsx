import Link from "next/link";
import { loadWaivers } from "../waiversPersistence";
import { MAJORS } from "../majorsData";
import { CATALOG_BY_ID } from "../courseCatalog";
import { WaiversEditor } from "./WaiversEditor";

// Build a deduplicated list of all courses referenced in major requirements only
function getAllRequirementCourses() {
  const seen = new Set<string>();
  const result: { courseId: string; title: string; department: string }[] = [];

  const add = (courseId: string) => {
    if (seen.has(courseId)) return;
    seen.add(courseId);
    const entry = CATALOG_BY_ID.get(courseId);
    result.push({
      courseId,
      title: entry?.title ?? courseId,
      department: entry?.department ?? "",
    });
  };

  // Only major courses — not graduation requirements
  for (const major of MAJORS) {
    for (const group of major.groups) {
      group.courses.forEach(add);
    }
  }

  return result.sort((a, b) => a.courseId.localeCompare(b.courseId));
}

export default function WaiversPage() {
  const courses = getAllRequirementCourses();
  const initial = loadWaivers();

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f4f6fb" }}>
      {/* Nav */}
      <div style={{ background: "#011F5B", height: 56, display: "flex", alignItems: "center", padding: "0 32px", gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PennTools</span>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <Link href="/tools/1" style={{ fontSize: 14, color: "#93b4e0", textDecoration: "none" }}>CourseMatch Assist</Link>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <span style={{ fontSize: 14, color: "#fff" }}>Waivers & Substitutions</span>
      </div>

      <div style={{ maxWidth: 760, margin: "40px auto 80px", padding: "0 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
            Waivers & Substitutions
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>
            Did you waive any courses or receive substitution credit? Add them here — they'll be marked as satisfied on your requirements pages.
            If you have nothing to add, just click <strong>Save & view requirements</strong>.
          </p>
        </div>

        <WaiversEditor courses={courses} initial={initial} />
      </div>
    </div>
  );
}
