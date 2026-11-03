// A look at the contact card with made-up data: no sign-in, no AI key, no AI
// call. For checking the layout while building; it says nothing about how well
// the AI reads real notes. Development only.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { DebriefCard } from "@penntools/tool-penn-pals";
import { Card } from "../PennPals";

export const metadata: Metadata = {
  title: "Penn Pals: sample card",
};

const SAMPLE: DebriefCard = {
  name: "Maria Chen",
  relationship: "alumni",
  classYear: "2022",
  company: "Stripe",
  role: "Product Manager",
  area: "Product",
  location: null,
  email: null,
  phone: null,
  linkedin: "linkedin.com/in/maria-chen",
  takeaways: ["Great energy", "Stripe's PM rotational program is worth looking at", "Suggested talking to her manager"],
  vibe: "great",
  nextSteps: [
    { action: "Ask Maria for an intro to her manager", owner: "me" },
    { action: "Send over Stripe's PM interview guide", owner: "them" },
  ],
  followUpDate: "2026-12-01",
  followUpReason: "After Thanksgiving",
};

export default function PennPalsDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div>
      <p style={{ marginBottom: 16, fontSize: "0.85rem" }}>
        Sample data only: no AI was used. The real page is at /tools/penn-pals.
      </p>
      <Card card={SAMPLE} defaultedDate={false} />
    </div>
  );
}
