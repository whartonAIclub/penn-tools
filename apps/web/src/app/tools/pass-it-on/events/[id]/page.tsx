import { notFound } from "next/navigation";
import { formatVendorLines, getPlannedEvent, getTemplate, listTasks, suggestedModules } from "@penntools/tool-pass-it-on";
import { db } from "../../db";
import { emptyEventForm } from "../emptyEventForm";
import { ChecklistPanel } from "../ChecklistPanel";
import { EventForm } from "../EventForm";

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const event = await getPlannedEvent(db(), params.id);
  if (!event) notFound();

  const [tasks, template, appliedRows] = await Promise.all([
    listTasks(db(), { eventIds: [event.id] }),
    getTemplate(db()),
    db()<{ module_key: string }[]>`SELECT module_key FROM event_modules WHERE event_id = ${event.id}`,
  ]);

  return (
    <>
    <EventForm
      id={event.id}
      initial={{
        title: event.title,
        eventDate: event.eventDate ?? "",
        eventTime: event.eventTime ?? "",
        theme: event.theme ?? "",
        venue: event.venue ?? "",
        budget: event.budget === null ? "" : String(event.budget),
        roles: event.roles.length > 0 ? event.roles.map((r) => ({ role: r.role, person: r.person ?? "" })) : emptyEventForm.roles,
        partnerClubs: event.partnerClubs.length > 0 ? event.partnerClubs : [""],
        vendors: formatVendorLines(event.vendors),
        notes: event.notes ?? "",
        confirmedClub: event.confirmedClub,
        confirmedVenue: event.confirmedVenue,
        clubContact: event.clubContact ?? "",
        totalAttendees: event.totalAttendees === null ? "" : String(event.totalAttendees),
        dropIns: event.dropIns === null ? "" : String(event.dropIns),
        ticketRevenue: event.ticketRevenue === null ? "" : String(event.ticketRevenue),
        costs: event.costs === null ? "" : String(event.costs),
        cancelled: event.cancelled,
      }}
    />
    <ChecklistPanel
      eventId={event.id}
      taskCount={tasks.length}
      modules={template?.modules ?? []}
      applied={appliedRows.map((r) => r.module_key)}
      suggested={suggestedModules(event)}
    />
    </>
  );
}
