import { describe, it, expect } from "vitest";
import { checkContactInput, checkInteractionInput, isDate, LIMITS } from "../input.js";

describe("checkContactInput", () => {
  it("trims text and turns blanks into null", () => {
    const checked = checkContactInput({
      name: "  Sarah Kim ",
      company: "Blackstone",
      role: "",
      metHow: "club",
      metAt: "  ",
      metOn: "2026-11-04",
      tags: [" alumni ", "PE"],
      notes: " Into bouldering. ",
      cadenceDays: 30,
      followUpOn: "",
      followUpNote: null,
    });
    expect(checked).toEqual({
      ok: true,
      value: {
        name: "Sarah Kim",
        company: "Blackstone",
        role: null,
        metHow: "club",
        metAt: null,
        metOn: "2026-11-04",
        tags: ["alumni", "PE"],
        notes: "Into bouldering.",
        cadenceDays: 30,
        followUpOn: null,
        followUpNote: null,
      },
    });
  });

  it("needs only a name", () => {
    const checked = checkContactInput({ name: "Sarah" });
    expect(checked).toMatchObject({ ok: true, value: { name: "Sarah", metHow: null, tags: [], notes: "", cadenceDays: null } });
  });

  it("refuses a missing name", () => {
    expect(checkContactInput({ name: "   " })).toEqual({ ok: false, error: "Enter a name." });
  });

  it("refuses text that's too long", () => {
    const checked = checkContactInput({ name: "Sarah", notes: "x".repeat(LIMITS.notes + 1) });
    expect(checked).toEqual({ ok: false, error: `Keep the notes to at most ${LIMITS.notes} characters.` });
  });

  it("accepts only the listed ways of meeting, or none", () => {
    expect(checkContactInput({ name: "Sarah", metHow: "" })).toMatchObject({ ok: true, value: { metHow: null } });
    expect(checkContactInput({ name: "Sarah", metHow: "dating app" })).toEqual({ ok: false, error: "Choose how you met." });
  });

  it("tidies tags: drops blanks and repeats (ignoring case) and collapses spaces", () => {
    const checked = checkContactInput({ name: "Sarah", tags: ["Alumni", "  ", "alumni", "private   equity"] });
    expect(checked).toMatchObject({ ok: true, value: { tags: ["Alumni", "private equity"] } });
  });

  it("limits how many tags there are and how long each is", () => {
    const tooMany = Array.from({ length: LIMITS.tags + 1 }, (_, i) => `tag${i}`);
    expect(checkContactInput({ name: "Sarah", tags: tooMany })).toEqual({ ok: false, error: `Use at most ${LIMITS.tags} tags.` });
    expect(checkContactInput({ name: "Sarah", tags: ["x".repeat(LIMITS.tag + 1)] })).toEqual({
      ok: false,
      error: `Keep each tag to at most ${LIMITS.tag} characters.`,
    });
    expect(checkContactInput({ name: "Sarah", tags: "alumni" })).toMatchObject({ ok: false });
  });

  it("refuses a cadence that isn't offered", () => {
    expect(checkContactInput({ name: "Sarah", cadenceDays: 7 })).toMatchObject({ ok: false });
    expect(checkContactInput({ name: "Sarah", cadenceDays: "30" })).toMatchObject({ ok: false });
  });

  it("refuses dates that don't exist", () => {
    expect(checkContactInput({ name: "Sarah", followUpOn: "2026-02-30" })).toEqual({
      ok: false,
      error: "The follow-up date isn't a valid date.",
    });
  });

  it("refuses input that isn't a form", () => {
    expect(checkContactInput(null)).toMatchObject({ ok: false });
    expect(checkContactInput(["Sarah"])).toMatchObject({ ok: false });
    expect(checkContactInput({ name: 42 })).toMatchObject({ ok: false });
  });
});

describe("checkInteractionInput", () => {
  it("accepts a date, a kind, a summary and the next follow-up", () => {
    const checked = checkInteractionInput({
      occurredOn: "2026-11-10",
      kind: "meeting",
      summary: " Coffee at Huntsman ",
      nextFollowUpOn: "2026-12-10",
      nextFollowUpNote: " Send the deck ",
    });
    expect(checked).toEqual({
      ok: true,
      value: {
        occurredOn: "2026-11-10",
        kind: "meeting",
        summary: "Coffee at Huntsman",
        nextFollowUpOn: "2026-12-10",
        nextFollowUpNote: "Send the deck",
      },
    });
  });

  it("clears the follow-up when no next one is given", () => {
    expect(checkInteractionInput({ occurredOn: "2026-11-10", kind: "call" })).toMatchObject({
      ok: true,
      value: { nextFollowUpOn: null, nextFollowUpNote: null },
    });
  });

  it("needs a date and a known kind", () => {
    expect(checkInteractionInput({ occurredOn: "", kind: "call" })).toEqual({ ok: false, error: "Enter when you were in touch." });
    expect(checkInteractionInput({ occurredOn: "2026-11-10", kind: "carrier pigeon" })).toMatchObject({ ok: false });
  });

  it("refuses a next follow-up date that doesn't exist", () => {
    expect(checkInteractionInput({ occurredOn: "2026-11-10", kind: "call", nextFollowUpOn: "soon" })).toEqual({
      ok: false,
      error: "The next follow-up date isn't a valid date.",
    });
  });
});

describe("isDate", () => {
  it("accepts real YYYY-MM-DD dates only", () => {
    expect(isDate("2028-02-29")).toBe(true);
    expect(isDate("2026-02-29")).toBe(false);
    expect(isDate("2026-13-01")).toBe(false);
    expect(isDate("11/04/2026")).toBe(false);
  });
});
