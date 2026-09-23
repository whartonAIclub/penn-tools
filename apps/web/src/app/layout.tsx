import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AskPenn",
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
      <body>{children}</body>
    </html>
  );
}
