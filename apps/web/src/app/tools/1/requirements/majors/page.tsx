import Link from "next/link";
import { loadSavedCourses, loadTranscriptMeta } from "../../transcriptPersistence";
import { loadWaivers } from "../../waiversPersistence";
import { MajorSelector } from "./MajorSelector";

export default function MajorsPage() {
  const courses = loadSavedCourses();
  const { declaredMajor } = loadTranscriptMeta();
  const waivers = loadWaivers();

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f4f6fb" }}>
      {/* Nav */}
      <div style={{ background: "#011F5B", height: 56, display: "flex", alignItems: "center", padding: "0 32px", gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PennTools</span>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <Link href="/tools/1" style={{ fontSize: 14, color: "#93b4e0", textDecoration: "none" }}>CourseMatch Assist</Link>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <Link href="/tools/1/requirements" style={{ fontSize: 14, color: "#93b4e0", textDecoration: "none" }}>Graduation Requirements</Link>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <span style={{ fontSize: 14, color: "#fff" }}>Major Requirements</span>
      </div>

      <div style={{ maxWidth: 860, margin: "40px auto 80px", padding: "0 24px" }}>

        {courses.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "64px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No transcript on file</div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>
              Upload your transcript first so we can map your courses to major requirements.
            </div>
            <Link
              href="/tools/1"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 24px", background: "#011F5B", color: "#fff",
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none",
              }}
            >
              Upload transcript →
            </Link>
          </div>
        ) : (
          <MajorSelector courses={courses} declaredMajor={declaredMajor} waivers={waivers} />
        )}

        <div style={{ textAlign: "center", marginTop: 32, fontSize: 13, color: "#9ca3af" }}>
          <Link href="/tools/1/requirements" style={{ color: "#011F5B", fontWeight: 600, textDecoration: "none" }}>
            ← Back to Graduation Requirements
          </Link>
        </div>
      </div>
    </div>
  );
}
