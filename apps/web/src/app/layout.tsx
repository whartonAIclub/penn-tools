import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { toolRegistry } from "@penntools/core/tools";
import "@/lib/container"; // registers the tools
import { communityTools } from "@/data/communityTools";
import { toolCatalog } from "@/lib/toolCatalog";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SidebarProvider, SiteSidebar } from "@/components/layout/SiteSidebar";
import { SECTIONS_COOKIE, SIDEBAR_COOKIE } from "@/components/layout/sidebarCookie";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get(SIDEBAR_COOKIE)?.value !== "closed";
  const collapsed = (cookieStore.get(SECTIONS_COOKIE)?.value ?? "").split(".").filter(Boolean);
  const sections = toolCatalog(toolRegistry.listManifests(), communityTools);

  return (
    <html lang="en">
      <body>
        <SidebarProvider initialOpen={sidebarOpen}>
          <SiteHeader />
          {/* See .app-body and .app-viewport in globals.css for why pages render in this box. */}
          <div className="app-body">
            <SiteSidebar sections={sections} initialCollapsed={collapsed} />
            <div className="app-viewport">
              <div className="app-scroll">{children}</div>
            </div>
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}
