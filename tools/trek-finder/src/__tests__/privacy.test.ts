// The trip file is in a public repo, so it must never hold anyone's personal
// contact details. These tests fail if trips.csv has anything that looks like
// an email address or phone number, or anything in the organizer contact or
// email columns. People's names can't be spotted automatically; the editor
// guide's rule covers those.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseCsv } from "../importSheet.js";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
// An international number ("+44 7700 900123") or a US-style one ("(215) 555-0100").
const PHONE = /\+\d[\d\s().-]{6,}\d|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;

/** Each cell's text, minus web links, whose long ids can look like numbers. */
function textOf(cell: string): string {
  return cell.replace(/https?:\/\/\S+/g, "");
}

function personalDetails(cell: string): string | null {
  const text = textOf(cell);
  if (EMAIL.test(text)) return "an email address";
  if (PHONE.test(text)) return "a phone number";
  return null;
}

describe("contact detail checks", () => {
  it("spots email addresses and phone numbers", () => {
    expect(personalDetails("Email jane.doe@upenn.edu to apply")).toBe("an email address");
    expect(personalDetails("WhatsApp +44 7700 900123")).toBe("a phone number");
    expect(personalDetails("Call (215) 555-0100")).toBe("a phone number");
    expect(personalDetails("215-555-0100")).toBe("a phone number");
  });

  it("leaves dates, prices, heights and links alone", () => {
    expect(personalDetails("2026-12-16")).toBe(null);
    expect(personalDetails("$1,000 deposit; summit at 13,044 ft; 8-10 hours")).toBe(null);
    expect(personalDetails("https://images.unsplash.com/photo-1741257091145-69d62cdf819a?w=1600")).toBe(null);
  });
});

describe("trips.csv", () => {
  const rows = parseCsv(readFileSync(new URL("../../sheet/trips.csv", import.meta.url), "utf8"));
  const [header = [], ...trips] = rows;

  it("has no email addresses or phone numbers", () => {
    const found: string[] = [];
    trips.forEach((row, index) => {
      row.forEach((cell, column) => {
        const kind = personalDetails(cell);
        // Name where it is, never what it is, so the test output doesn't repeat it.
        if (kind) found.push(`row ${index + 2}, column "${header[column] ?? column + 1}": ${kind}`);
      });
    });
    expect(found).toEqual([]);
  });

  it("leaves the organizer contact and email columns blank", () => {
    const blank = ["Organizer contact", "Organizer email"].map((name) => header.indexOf(name));
    const filled = trips.flatMap((row, index) =>
      blank.filter((column) => column >= 0 && (row[column] ?? "").trim() !== "").map((column) => `row ${index + 2}, column "${header[column]}"`),
    );
    expect(filled).toEqual([]);
  });
});
