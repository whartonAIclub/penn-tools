"use client";

export default function Error({ error }: { error: Error }) {
  return (
    <div style={{ padding: "40px", fontFamily: "monospace" }}>
      <h2 style={{ color: "red" }}>Error loading page</h2>
      <pre style={{ background: "#fee", padding: "16px", borderRadius: "8px", whiteSpace: "pre-wrap" }}>
        {error.message}
        {"\n"}
        {error.stack}
      </pre>
    </div>
  );
}
