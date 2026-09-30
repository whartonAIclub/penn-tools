// AskPenn — renders the chat interface for signed-in users.
// This is a server component; the interactive shell is a client component.

import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "AskPenn",
};

export default async function AskPennPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <SignInPrompt title="AskPenn" message="Sign in to chat with AskPenn and keep your chat history." />;
  }
  return <AppShell user={{ id: user.id, name: user.name, email: user.email, image: user.image }} />;
}
