// Registration dates the tool shows (registration banner and Step 3).
// Change only this file each term.

export const KEY_DATES = {
  /** Last day to add a spring course (Penn academic calendar). */
  lastDayToAdd: "Feb 2, 2027",
  /** What kind of course the add deadline is for, as in "Last day to add a spring course". */
  addTerm: "spring",
  /**
   * The Advance Registration window, once confirmed (e.g. "Nov 3–14, 2026").
   * null until then: the banner tells students to check MyWharton instead.
   */
  advanceRegistration: null as string | null,
};

/** The banner's Advance Registration sentence. */
export function advanceRegistrationLine(dates: { advanceRegistration: string | null } = KEY_DATES): string {
  return dates.advanceRegistration
    ? `Advance Registration: ${dates.advanceRegistration}.`
    : "Check MyWharton for this term's Advance Registration window.";
}
