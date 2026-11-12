// The emails the tool writes (templates in SPEC.md) and the mailto links that
// open them in the student's email app. Nothing is sent from the tool.

import { courseCode } from "./flow.js";
import type { ContactSource, Course, PermissionStatus, Year } from "./flow.js";

export interface Email {
  /** "" when there's no address yet: the student fills it in their email app. */
  to: string;
  subject: string;
  body: string;
}

/** Who's asking, for the emails. */
export interface Sender {
  name: string;
  year: Year;
  term: string;
}

/** Stands in for the name until the student types it. */
export const NAME_PLACEHOLDER = "[Your name]";

/** The permission request to the department, for one course. */
export function permissionEmail(course: Course, sender: Sender): Email {
  const name = sender.name.trim() || NAME_PLACEHOLDER;
  const code = courseCode(course);
  return {
    to: course.contact.trim(),
    subject: `Permission to enroll in ${code}`,
    body:
      `Hi,\n\n` +
      `My name is ${name} and I'm a ${sender.year}-year MBA student at Wharton. ` +
      `I came across ${code} ${course.title} and I'm interested in taking it for ${sender.term}. ` +
      `I wanted to check if I'm eligible to enroll and if there's anything I need to do to get permission. ` +
      `If there's someone else I should contact please let me know.\n\n` +
      `Thank you,\n${name}`,
  };
}

/** A mailto link that opens the email with To, Subject and Body filled in. */
export function mailtoLink(email: Email): string {
  // Keep "@" readable; encode anything that would break the link.
  const to = encodeURIComponent(email.to).replace(/%40/g, "@");
  return `mailto:${to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
}

/** The label beside "Who to email" and the line under the box. */
export const CONTACT_SOURCES: Record<ContactSource, { label: string; note: string }> = {
  details: { label: "FOUND IN COURSE DETAILS", note: "Taken from the course details you added." },
  directory: { label: "AUTO-FILLED", note: "From our department contact list. Check it's right before you send." },
  none: {
    label: "NOT FOUND",
    note: "Add the instructor's or department's email from the Penn Directory or the department website.",
  },
  you: { label: "EDITED BY YOU", note: "Using the email you entered." },
};

/** The student typed in the "Who to email" box. Clearing it goes back to NOT FOUND. */
export function withContact(course: Course, contact: string): Course {
  return { ...course, contact, contactSource: contact.trim() ? "you" : "none" };
}

/** Clicking "Open in email" marks a request that wasn't sent yet as waiting. */
export function afterOpeningEmail(status: PermissionStatus): PermissionStatus {
  return status === "not-sent" ? "waiting" : status;
}

export const PERMISSION_LABELS: Record<PermissionStatus, { pill: string; option: string }> = {
  "not-sent": { pill: "NOT SENT", option: "Not sent" },
  waiting: { pill: "WAITING", option: "Waiting" },
  approved: { pill: "✓ APPROVED", option: "Approved" },
  declined: { pill: "DECLINED", option: "Declined" },
};

export const PERMISSION_STATUSES: readonly PermissionStatus[] = ["not-sent", "waiting", "approved", "declined"];
