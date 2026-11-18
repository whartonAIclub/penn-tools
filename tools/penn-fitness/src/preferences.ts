// User preferences are stored as one JSON value per section (shared, outtake,
// intake) in the preferences table, so a half can add a preference without a
// database change. Each section is defined here in code: its fields, defaults
// and checks.
//
// To add a field: add it to the section's type, give it a default, and check
// it. Users who saved the section before get the default, since stored values
// are laid over the defaults. Don't change what an existing field means;
// add a field with a new name instead.

export interface PreferenceSection<T extends object> {
  /** The section's key in the preferences table: "shared", "outtake" or "intake". */
  readonly name: string;
  /** What a user has until they save their own. */
  readonly defaults: T;
  /** What's wrong with these preferences, as messages for the user; empty when they're valid. */
  check(value: T): string[];
}
