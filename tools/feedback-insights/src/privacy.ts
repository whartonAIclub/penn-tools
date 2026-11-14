// Anonymous surveys still collect names: "thanks Ananya", "mentor sam was
// great", an email, a phone number. These helpers find them so a person can
// decide, and mask contact details before text leaves the browser for an AI
// provider. They suggest; they never delete an answer.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const HANDLE = /(^|[\s(])@[A-Za-z0-9_.]{2,}/g;
const PHONE = /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;

// A word after one of these is often a name.
const ROLE = /\b(?:professor|prof\.?|dr\.?|mr\.?|ms\.?|mrs\.?|mentor|ta|teammate|partner|coach|instructor|organizer|thanks|thank you|thx|shout ?out to|shout-out to)\s+([A-Za-z][a-z'-]+)/gi;
// …unless it is one of these.
const NOT_NAMES = new Set(
  "was were is are and or but so the a an for to of in on at who that helped help never always really very sessions session office hours support feedback team teams meetings check everyone all you guys y much again everything did didn could would should had has have kept made gave from with responded replied answered program organizers mentors tas it this me us my our".split(
    " ",
  ),
);
// A lowercase word after a role is a name only when the sentence goes on like this.
const AFTER_NAME = /^\s*(?:$|[,.!;)]|(?:was|is|were|helped|did|didn't|never|always|said|told|kept|and|who|really|actually|literally|basically|carried|saved)\b)/i;

/** True when `text` holds an email, phone number or @handle. */
export function hasContactInfo(text: string): boolean {
  return [EMAIL, HANDLE, PHONE].some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/** True when `text` may name a person or hold contact details. */
export function hasPersonalInfo(text: string): boolean {
  if (hasContactInfo(text)) return true;
  for (const m of text.matchAll(ROLE)) {
    const word = m[1]!;
    if (NOT_NAMES.has(word.toLowerCase())) continue;
    if (/^[A-Z]/.test(word)) return true;
    if (AFTER_NAME.test(text.slice(m.index + m[0].length))) return true;
  }
  return false;
}

/** `text` with emails, phone numbers and @handles replaced by [email], [phone] and [handle]. */
export function maskContactInfo(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[phone]")
    .replace(HANDLE, (_match, before: string) => `${before}[handle]`);
}
