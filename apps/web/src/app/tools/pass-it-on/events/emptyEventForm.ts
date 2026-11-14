// The blank event form. Kept out of EventForm.tsx because that file is a client
// component, and server pages can only import components from client files.

import type { EventFormValues } from "../actions";

export const emptyEventForm: EventFormValues = {
  title: "",
  eventDate: "",
  eventTime: "",
  theme: "",
  venue: "",
  budget: "",
  roles: [],
  partnerClubs: [""],
  vendors: "",
  notes: "",
  confirmedClub: false,
  confirmedVenue: false,
  clubContact: "",
  totalAttendees: "",
  dropIns: "",
  ticketRevenue: "",
  costs: "",
  cancelled: false,
  needsEquipment: false,
  equipment: "",
};
