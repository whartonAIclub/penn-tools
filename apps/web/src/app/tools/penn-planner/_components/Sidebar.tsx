"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/tools/penn-planner", icon: "⊞", label: "Dashboard" },
  { href: "/tools/penn-planner/settings", icon: "⚙", label: "Settings" },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside
      style={{
        width: "220px",
        minHeight: "100%",
        background: "#fff",
        borderRight: "1px solid #e5e5e5",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "20px 18px 8px",
          fontSize: "10px",
          fontWeight: 700,
          color: "#9b9b9b",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
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
              }}
            >
              <span style={{ fontSize: "16px", opacity: 0.75 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
