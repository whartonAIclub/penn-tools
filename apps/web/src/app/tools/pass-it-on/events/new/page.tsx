import { emptyEventForm } from "../emptyEventForm";
import { EventForm } from "../EventForm";
import { nameSuggestions } from "../../people";

export default async function NewEventPage() {
  const { roleDefaults, memberNames } = await nameSuggestions();
  return <EventForm id={null} initial={emptyEventForm} roleDefaults={roleDefaults} memberNames={memberNames} />;
}
