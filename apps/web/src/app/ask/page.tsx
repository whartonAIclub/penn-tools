// AskPenn — renders the chat interface.
// This is a server component; the interactive shell is a client component.

import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "AskPenn",
};

export default function AskPennPage() {
  return <AppShell />;
}
