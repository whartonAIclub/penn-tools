import type { BidGuidance, ClearingPriceRecord } from "@penntools/tool-1/track4";
import { computeBidGuidance, SEED_RECORDS } from "@penntools/tool-1/track4";
import { BidGuidanceSection } from "./BidGuidanceSection";
import { SchedulerSection } from "./SchedulerSection";
import { loadPersistedRecords, getStoredTerms } from "./persistence";
import { buildGuidance } from "./guidance";

function buildSeedGuidance(): BidGuidance[] {
  const groups = new Map<string, ClearingPriceRecord[]>();
  for (const r of SEED_RECORDS) {
    const key = `${r.courseId}::${r.section}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .map(([key, records]) => {
      const sep      = key.indexOf("::");
      const courseId = key.slice(0, sep);
      const section  = key.slice(sep + 2);
      return computeBidGuidance(courseId, section, records);
    })
    .filter((g): g is BidGuidance => g !== null);
}

const steps = [
  { title: "Upload", description: "Submit your academic transcript in PDF or CSV format." },
  { title: "Match", description: "Maps your courses to the best schedule." },
  { title: "Review", description: "Get a clear report of matched credits and any gaps to fill." },
];

export default function Tool1Page() {
  const persisted = loadPersistedRecords();
  const isUsingRealData = persisted.length > 0;
  const guidance    = isUsingRealData ? buildGuidance(persisted) : buildSeedGuidance();
  const storedTerms = isUsingRealData ? getStoredTerms() : [];

  return (
    <div style={{ minHeight: "100vh", fontFamily: "sans-serif" }}>
      {/* Hero */}
      <section style={{ background: "#1e3a5f", color: "#fff", padding: "80px 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: "bold", margin: "0 0 16px" }}>CourseMatch Assist</h1>
        <p style={{ fontSize: "1.2rem", maxWidth: "600px", margin: "0 auto", opacity: 0.85 }}>
          Plan courses for next semester with confidence. Upload your transcript and let us curate the perfect course list for you.
        </p>
      </section>

      {/* Upload Zone */}
      <section style={{ padding: "60px 24px" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "12px" }}>Upload Your Transcript</h2>
          <p style={{ color: "#666", marginBottom: "32px" }}>Drag and drop your file or click to browse. We accept PDF and CSV formats.</p>
          <div style={{ border: "2px dashed #ccc", borderRadius: "16px", padding: "48px", cursor: "pointer" }}>
            <p style={{ fontWeight: "500", marginBottom: "12px" }}>Drag & drop your transcript</p>
            <p style={{ color: "#888", fontSize: "0.9rem", marginBottom: "16px" }}>or</p>
            <button style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 32px", fontSize: "1rem", cursor: "pointer" }}>
              Browse Files
            </button>
            <p style={{ color: "#aaa", fontSize: "0.8rem", marginTop: "16px" }}>Supports PDF, CSV · Max 10MB</p>
          </div>
        </div>
      </section>

      {/* Schedule Builder — finds non-conflicting schedules and shows bid guidance per course */}
      <SchedulerSection guidance={guidance} />

      {/* Bid Guidance — upload clearing price files to improve recommendations */}
      <BidGuidanceSection
        defaultGuidance={guidance}
        defaultStoredTerms={storedTerms}
        isUsingSeedData={!isUsingRealData}
      />

      {/* How It Works */}
      <section style={{ background: "#f5f7fa", padding: "60px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "8px" }}>How It Works</h2>
        <p style={{ color: "#666", marginBottom: "40px" }}>Three simple steps to clarity</p>
        <div style={{ display: "flex", gap: "24px", justifyContent: "center", flexWrap: "wrap", maxWidth: "900px", margin: "0 auto" }}>
          {steps.map((step, i) => (
            <div key={step.title} style={{ background: "#fff", borderRadius: "16px", padding: "32px", flex: "1 1 220px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#ccc", marginBottom: "8px" }}>0{i + 1}</div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "8px" }}>{step.title}</h3>
              <p style={{ color: "#666", fontSize: "0.9rem", lineHeight: 1.6 }}>{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e5e7eb", padding: "24px", textAlign: "center", color: "#888", fontSize: "0.85rem" }}>
        © {new Date().getFullYear()} CourseMatch Assist. All rights reserved.
      </footer>
    </div>
  );
}
