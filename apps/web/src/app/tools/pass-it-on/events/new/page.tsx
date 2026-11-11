import { emptyEventForm } from "../emptyEventForm";
import { EventForm } from "../EventForm";

export default function NewEventPage() {
  return <EventForm id={null} initial={emptyEventForm} />;
}
