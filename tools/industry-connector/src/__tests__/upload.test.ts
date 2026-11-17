import { describe, expect, it } from "vitest";
import { checkUpload, MAX_UPLOAD_PEOPLE, personKey } from "../index.js";

// Made-up people only: tests never read a data file.
const entry = (overrides: Record<string, unknown> = {}) => ({
  name: "Alex Sample",
  gradYear: 2026,
  program: "FT MBA",
  isAlumni: true,
  currentEmployer: "Example Co",
  currentTitle: "Associate",
  industries: ["Consulting"],
  ...overrides,
});

describe("checkUpload", () => {
  it("accepts a well-formed file, ignoring fields it doesn't use", () => {
    const result = checkUpload([entry(), entry({ name: "Bailey Example", careerPathId: 123 })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]).not.toHaveProperty("careerPathId");
  });

  it("fills in a missing current job as empty", () => {
    const result = checkUpload([entry({ currentEmployer: undefined, currentTitle: undefined })]);
    expect(result.ok && result.entries[0]?.currentEmployer).toBe("");
  });

  it("rejects anything that isn't a non-empty array", () => {
    expect(checkUpload({ people: [] }).ok).toBe(false);
    expect(checkUpload([]).ok).toBe(false);
    expect(checkUpload(null).ok).toBe(false);
  });

  it("rejects the whole file and names each bad entry by position and field", () => {
    const result = checkUpload([entry(), entry({ name: "B", industries: ["Consulting", "Basket Weaving"] }), entry({ name: "C", gradYear: 1800 })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ position: 2, field: "industries[1]" }),
        expect.objectContaining({ position: 3, field: "gradYear" }),
      ]),
    );
  });

  it("needs at least one industry, a boolean isAlumni and limited lengths", () => {
    expect(checkUpload([entry({ industries: [] })]).ok).toBe(false);
    expect(checkUpload([entry({ isAlumni: "yes" })]).ok).toBe(false);
    expect(checkUpload([entry({ name: "x".repeat(201) })]).ok).toBe(false);
  });

  it("rejects the same person twice", () => {
    const result = checkUpload([entry(), entry({ name: "  alex   SAMPLE " })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatchObject({ position: 2 });
  });

  it("refuses files with too many people before checking them", () => {
    const result = checkUpload(new Array(MAX_UPLOAD_PEOPLE + 1).fill(0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toHaveLength(1);
  });
});

describe("personKey", () => {
  it("matches by name, year and program, whether or not the file has a CareerPath ID", () => {
    expect(personKey(entry({ careerPathId: 42 }) as never)).toBe(personKey(entry() as never));
    expect(personKey(entry({ name: " Alex  Sample " }) as never)).toBe(personKey(entry({ name: "alex sample" }) as never));
    expect(personKey(entry({ gradYear: 2027 }) as never)).not.toBe(personKey(entry() as never));
  });
});
