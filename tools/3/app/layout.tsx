import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Penn-priorities — Your AI Academic & Career Planner",
  description: "AI-powered priority planner for Penn students",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col" style={{ fontFamily: "var(--font-inter), 'Helvetica Neue', Arial, sans-serif" }}>
        {/* Top nav bar — Wharton blue */}
        <header
          style={{
            background: "#011F5B",
            height: "56px",
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            gap: "16px",
            position: "sticky",
            top: 0,
            zIndex: 50,
            flexShrink: 0,
          }}
        >
          {/* Penn shield + wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                fontWeight: 900,
                color: "#011F5B",
                flexShrink: 0,
              }}
            >
              P
            </div>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: "17px", letterSpacing: "-0.02em" }}>
              Penn-priorities
            </span>
          </div>


          {/* Right: user avatar placeholder */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              N
            </div>
          </div>
        </header>

        {/* Body: sidebar + page content */}
        <div style={{ display: "flex", flex: 1, background: "#f0f2f5" }}>
          <Sidebar />
          <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
