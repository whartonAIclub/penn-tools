import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Handoff } from "../Handoff";
import { previewEnabled } from "../world";

// The development preview: today's prototype with its sample accounts, demo clock and
// self-tests, kept apart from the live app at /tools/handoff. Development only:
// Next inlines NODE_ENV at build time, so a production build answers 404 here.

export const metadata: Metadata = {
  title: "Handoff · PennTools",
  description: "Development preview of Handoff with sample data.",
};

export default function HandoffPreviewPage() {
  if (!previewEnabled(process.env.NODE_ENV)) notFound();
  return <Handoff />;
}
