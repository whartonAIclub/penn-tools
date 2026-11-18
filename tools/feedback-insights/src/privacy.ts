// Anonymous surveys still collect names: "thanks Ananya", "mentor sam was
// great", an email, a phone number. These helpers find them so a person can
// decide, and mask contact details before text leaves the browser for an AI
// provider. They suggest; they never delete an answer.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const HANDLE = /(^|[\s(])@[A-Za-z0-9_.]{2,}/g;
// 215-555-1234, (215) 555 1234, 2155551234, +1 215 555 1234.
const PHONE = /(?:\+\d{1,3}[-.\s]?)?(?:\(\d{3}\)|\b\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

// A word after one of these is often a name.
// Role words can follow each other: "thanks mentor Sam", "Thanks Dr. Patel".
const ROLE = /\b(?:(?:professor|prof\.?|dr\.?|mr\.?|ms\.?|mrs\.?|mentor|ta|teammate|partner|coach|instructor|organizer|thanks|thank you|thx|shout ?out to|shout-out to)\s+)+([A-Za-z][a-z'-]+)/gi;
// …unless it is one of these.
const NOT_NAMES = new Set(
  "was were is are and or but so the a an for to of in on at who that helped help never always really very sessions session office hours support feedback team teams meetings check everyone all you guys y much again everything did didn could would should had has have kept made gave from with responded replied answered program organizers mentors tas it this me us my our".split(
    " ",
  ),
);
// Capitalized words after "thanks" or "mentor" that name an organization or product, not a person.
const NOT_PEOPLE = new Set(
  "penn penntools wharton upenn claude anthropic openai chatgpt gpt google microsoft apple amazon meta linkedin slack zoom github notion canvas waiac pmt ai companies company firms organizers organizer everyone team club".split(" "),
);
// "Thanks Acme team", "mentor Google engineer": a group or job after the word.
const GROUP_WORDS = new Set("team teams club clubs platform staff folks people crew engineer engineers companies company firm program school center office".split(" "));
// Capitalized words, then the group word: "Acme team", "Google Cloud engineers". Case matters for the capitals, so "Ananya and the team" is a person.
const groupAfter = (rest: string) => GROUP_WORDS.has((rest.match(/^(?:\s+[A-Z][\w'-]*)*\s+([A-Za-z]+)\b/)?.[1] ?? "").toLowerCase());

// A lowercase word after a role is a name only when the sentence goes on like this.
const AFTER_NAME = /^\s*(?:$|[,.!;)]|(?:was|is|were|helped|did|didn't|never|always|said|told|kept|and|who|really|actually|literally|basically|carried|saved)\b)/i;

/** True when `text` holds an email, phone number or @handle. */
export function hasContactInfo(text: string): boolean {
  return [EMAIL, HANDLE, PHONE].some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/** Where `text` names someone after a role word ("thanks Ananya", "mentor sam was great"): the name's start and end. */
function namesIn(text: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  for (const m of text.matchAll(ROLE)) {
    const word = m[1]!;
    if (NOT_NAMES.has(word.toLowerCase())) continue;
    const after = m.index + m[0].length;
    if (!/^[A-Z]/.test(word) && !AFTER_NAME.test(text.slice(after))) continue;
    // "Thanks PennTools", "thank you Wharton AI Club", "Partner Companies": an organization, not a person.
    if (NOT_PEOPLE.has(word.toLowerCase()) || /^[A-Z][a-z]*[A-Z]/.test(word) || groupAfter(text.slice(after))) continue;
    // "Jamie Lee": capitalized words right after a capitalized name are the rest of it.
    const rest = /^[A-Z]/.test(word) ? text.slice(after).match(/^(?:\s+[A-Z][a-z'-]+)+/) : null;
    found.push({ start: after - word.length, end: after + (rest ? rest[0].length : 0) });
  }
  return found;
}

/** True when `text` may name a person or hold contact details. */
export function hasPersonalInfo(text: string): boolean {
  return hasContactInfo(text) || namesIn(text).length > 0;
}

/**
 * `text` with contact details masked and any name found after a role word
 * replaced by [name]. A name with no role word before it ("Ananya was great")
 * is not found, so the page still asks a person to look at what comes back.
 */
export function maskPersonalInfo(text: string): string {
  const masked = maskContactInfo(text);
  let out = "";
  let at = 0;
  for (const { start, end } of namesIn(masked)) {
    out += `${masked.slice(at, start)}[name]`;
    at = end;
  }
  return out + masked.slice(at);
}

/** `text` with emails, phone numbers and @handles replaced by [email], [phone] and [handle]. */
export function maskContactInfo(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[phone]")
    .replace(HANDLE, (_match, before: string) => `${before}[handle]`);
}
