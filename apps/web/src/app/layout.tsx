import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "PennTools",
  description: "AI-powered tools for the Penn community",
  icons: {
    icon: "/wharton-ai-club-logo.png",
    shortcut: "/wharton-ai-club-logo.png",
    apple: "/wharton-ai-club-logo.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {/* See .app-viewport in globals.css for why pages render in this box. */}
        <div className="app-viewport">
          <div className="app-scroll">{children}</div>
        </div>
      </body>
    </html>
  );
}
