// The emails the tool writes (templates in SPEC.md) and the mailto links that
// open them in the student's email app. Nothing is sent from the tool.

import { departmentName } from "./departments.js";
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
  /** null until the student picks it. */
  year: Year | null;
  /** "" until the student picks it. */
  term: string;
}

/** Stand-ins shown in the preview until the student fills in their details. */
export const NAME_PLACEHOLDER = "[Your name]";
export const YEAR_PLACEHOLDER = "[first/second]";
export const TERM_PLACEHOLDER = "[Term]";

/** "Open in email" stays locked until name, year and term are all filled in. */
export function senderReady(sender: Sender): boolean {
  return sender.name.trim() !== "" && sender.year !== null && sender.term !== "";
}

function fill(sender: Sender) {
  return {
    name: sender.name.trim() || NAME_PLACEHOLDER,
    year: sender.year ?? YEAR_PLACEHOLDER,
    term: sender.term || TERM_PLACEHOLDER,
  };
}

/** The permission request to the department, for one course. */
export function permissionEmail(course: Course, sender: Sender): Email {
  const { name, year, term } = fill(sender);
  const code = courseCode(course);
  return {
    to: course.contact.trim(),
    subject: `Permission to enroll in ${code}`,
    body:
      `Hi,\n\n` +
      `My name is ${name} and I'm a ${year}-year MBA student at Wharton. ` +
      `I came across ${code} ${course.title} and I'm interested in taking it for ${term}. ` +
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

/**
 * A Google search for the contact, for when the course details had no email.
 * The student reads the results and types the email; the tool never fills it in.
 */
export function findEmailSearch(course: Course): { label: string; query: string; href: string } | null {
  if (course.contactSource === "details") return null;
  const query = course.instructor
    ? `"${course.instructor}" email upenn`
    : `${departmentName(course.dept) ?? course.dept} department email upenn`;
  return {
    label: course.instructor ? `Find ${course.instructor}'s email` : "Find the department email",
    query,
    href: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  };
}

/** Where registration requests go (SPEC.md, policy). */
export const REGISTRATION_ADDRESS = "mbaprogram@wharton.upenn.edu";

/** The one registration email to the MBA Program Office, listing every approved course. */
export function registrationEmail(courses: readonly Course[], sender: Sender): Email {
  const { name, year, term } = fill(sender);
  const many = courses.length > 1;
  const codes = courses.map(courseCode);
  const list = courses.map((c) => `- ${courseCode(c)}, ${c.title}`).join("\n");
  return {
    to: REGISTRATION_ADDRESS,
    subject: `Non-Wharton course registration – ${codes.join(", ")}`,
    body:
      `Hi,\n\n` +
      `My name is ${name} and I'm a ${year}-year MBA student. ` +
      `I'd like to take the following non-Wharton ${many ? "courses" : "course"} for ${term} ` +
      `and I've received permission from the ${many ? "departments" : "department"}:\n\n` +
      `${list}\n\n` +
      `Please let me know if there's anything else I need to do to register.\n\n` +
      `Thank you,\n${name}`,
  };
}
