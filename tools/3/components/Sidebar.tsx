"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",          icon: "⊞", label: "Dashboard" },
  { href: "/settings",  icon: "⚙", label: "Settings"  },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside
      style={{
        width: "220px",
        minHeight: "100vh",
        background: "#fff",
        borderRight: "1px solid #e5e5e5",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Section label */}
      <div style={{ padding: "20px 18px 8px", fontSize: "10px", fontWeight: 700, color: "#9b9b9b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        MY ACTIVITY
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 10px" }}>
        {NAV.map(({ href, icon, label }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 10px",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: active ? 700 : 400,
                color: active ? "#011F5B" : "#333",
                background: active ? "#EEF2FF" : "transparent",
                textDecoration: "none",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f5f5f5"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: "16px", opacity: 0.75 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div style={{ margin: "16px 18px", borderTop: "1px solid #e5e5e5" }} />

      {/* Sources section */}
      <div style={{ padding: "0 18px 8px", fontSize: "10px", fontWeight: 700, color: "#9b9b9b", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        CONNECTED SOURCES
      </div>
      <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {[
          { label: "Canvas",      color: "#1d4ed8", status: "Connected" },
          { label: "CareerPath",  color: "#6d28d9", status: "Connected" },
          { label: "Google Cal",  color: "#059669", status: "Coming soon" },
        ].map(({ label, color, status }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", color: "#444" }}>{label}</span>
            <span style={{ fontSize: "10px", color, fontWeight: 600 }}>{status}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
