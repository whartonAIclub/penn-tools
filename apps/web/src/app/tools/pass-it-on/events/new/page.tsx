import { listMembers, listRoleDefaults } from "@penntools/tool-pass-it-on";
import { db } from "../../db";
import { emptyEventForm } from "../emptyEventForm";
import { EventForm } from "../EventForm";

export default async function NewEventPage() {
  const [roleDefaults, members] = await Promise.all([listRoleDefaults(db()), listMembers(db(), { activeOnly: true })]);
  return <EventForm id={null} initial={emptyEventForm} roleDefaults={roleDefaults} memberNames={members.map((m) => m.name)} />;
}
