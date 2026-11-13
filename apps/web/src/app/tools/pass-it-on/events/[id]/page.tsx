import { notFound } from "next/navigation";
import { formatVendorLines, getPlannedEvent, getTemplate, listMembers, listRoleDefaults, listTasks, suggestedModules } from "@penntools/tool-pass-it-on";
import { db } from "../../db";
import { ChecklistPanel } from "../ChecklistPanel";
import { EventForm } from "../EventForm";

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const event = await getPlannedEvent(db(), params.id);
  if (!event) notFound();

  // The module list comes from the template version the event was built from, else the latest.
  const [versionRow] = await db()<{ version: string | null }[]>`SELECT template_version_id::text AS version FROM events WHERE id = ${event.id}`;
  const [tasks, template, appliedRows, roleDefaults, members] = await Promise.all([
    listTasks(db(), { eventIds: [event.id] }),
    getTemplate(db(), versionRow?.version ? Number(versionRow.version) : undefined),
    db()<{ module_key: string }[]>`SELECT module_key FROM event_modules WHERE event_id = ${event.id}`,
    listRoleDefaults(db()),
    listMembers(db(), { activeOnly: true }),
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
        roles: event.roles.map((r) => ({ role: r.role, person: r.person ?? "" })),
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
        needsEquipment: event.needsEquipment,
        equipment: event.equipment.join("\n"),
      }}
      roleDefaults={roleDefaults}
      memberNames={members.map((m) => m.name)}
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
