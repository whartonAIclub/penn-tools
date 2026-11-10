import { notFound } from "next/navigation";
import { formatVendorLines, getPlannedEvent } from "@penntools/tool-pass-it-on";
import { db } from "../../db";
import { EventForm } from "../EventForm";

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const event = await getPlannedEvent(db(), params.id);
  if (!event) notFound();

  return (
    <EventForm
      id={event.id}
      initial={{
        title: event.title,
        eventDate: event.eventDate ?? "",
        theme: event.theme ?? "",
        venue: event.venue ?? "",
        budget: event.budget === null ? "" : String(event.budget),
        pubLeader: event.pubLeader ?? "",
        partnerClubs: event.partnerClubs.join("\n"),
        vendors: formatVendorLines(event.vendors),
      }}
    />
  );
}
