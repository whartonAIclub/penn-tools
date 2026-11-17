import { emptyEventForm } from "../emptyEventForm";
import { EventForm } from "../EventForm";
import { nameSuggestions } from "../../people";
import { isBoardMember } from "../../access";

export default async function NewEventPage() {
  if (!(await isBoardMember())) return null;
  const { roleDefaults, memberNames } = await nameSuggestions();
  return <EventForm id={null} initial={emptyEventForm} roleDefaults={roleDefaults} memberNames={memberNames} />;
}
