// Extra fields on any stored record (a schedule block, a place, a workout
// slot...), kept in its table's `attributes` JSONB column. Either half can add
// one without a database change: give it a name prefixed by the half that owns
// it (e.g. "intake.mealType"), unless both halves use it, and read it with a
// default, since older records won't have it.
//
// Fields the code searches, sorts or constrains on belong in real columns instead.

export type Attributes = Readonly<Record<string, unknown>>;

export const NO_ATTRIBUTES: Attributes = Object.freeze({});
