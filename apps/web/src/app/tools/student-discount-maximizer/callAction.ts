// Calls one of the tool's server actions from the browser. Problems the
// student should see come back as data (see actions.ts); this also turns a
// call that fails outright, such as when the student is offline, into one.

import type { ActionResult } from "./actions";

export async function callAction<T>(action: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await action();
  } catch {
    return { ok: false, error: { message: "Something went wrong. Try again." } };
  }
}
