import { EventForm } from "../EventForm";

export default function NewEventPage() {
  return <EventForm id={null} initial={{ title: "", eventDate: "", theme: "", venue: "", budget: "", pubLeader: "", partnerClubs: "", vendors: "" }} />;
}
