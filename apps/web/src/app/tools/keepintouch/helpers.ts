// Shared by Keep in Touch's client components (KeepInTouch, ContactForm and
// ContactDetails).

import { useState } from "react";
import type { AIProvider } from "@penntools/core/ai";
import type { CADENCES, LIMITS, MET_HOW } from "@penntools/tool-keepintouch";
import type { ActionResult } from "./actions";

/** The choices and limits the page passes down to its forms. */
export interface FormOptions {
  cadences: typeof CADENCES;
  metHow: typeof MET_HOW;
  defaultCadenceDays: number;
  limits: typeof LIMITS;
  /** Providers the user has saved an API key for, for quick capture; empty without one. */
  providers: AIProvider[];
  providerLabels: Record<AIProvider, string>;
}

/** Today's date where the user is, as YYYY-MM-DD. */
export function localToday(): string {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}

/**
 * "Nov 4, 2026" for 2026-11-04, or "Nov 4" when it's in the same year as
 * `today`. A fixed locale, so the server and browser render the same text.
 */
export function formatDate(date: string, today?: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const sameYear = today?.startsWith(`${year}-`) ?? false;
  return new Date(year!, month! - 1, day!).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** The label for a check-in interval, e.g. "Every month". */
export function cadenceLabel(cadences: FormOptions["cadences"], days: number | null): string | null {
  if (days === null) return null;
  return cadences.find((c) => c.days === days)?.label ?? `Every ${days} days`;
}

/** Runs a server action and tracks whether it's running and its error. If the call itself fails (e.g. offline), that's an error too. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(action: () => Promise<ActionResult<T>>, onDone: (data: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) onDone(result.data);
      else setError(result.error);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
