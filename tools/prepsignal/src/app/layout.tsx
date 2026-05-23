import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrepSignal",
  description: "AI-powered case interview scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
