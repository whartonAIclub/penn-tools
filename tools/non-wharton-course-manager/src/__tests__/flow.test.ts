import { describe, it, expect } from "vitest";
import { EMPTY_PROGRESS, stepStatuses, upcomingTerms } from "../flow.js";
import type { Course } from "../flow.js";

function course(overrides: Partial<Course>): Course {
  return {
    id: "c",
    dept: "DSGN",
    number: "5100",
    section: "001",
    title: "Product Design Studio",
    format: "In class",
    instructor: "",
    email: "",
    crossListing: null,
    picked: true,
    permission: "not-sent",
    ...overrides,
  };
}

describe("stepStatuses", () => {
  it("starts with only Step 1 unlocked", () => {
    const [s1, s2, s3] = stepStatuses(EMPTY_PROGRESS);
    expect(s1).toMatchObject({ unlocked: true, done: false, label: "START HERE" });
    expect(s2).toMatchObject({ unlocked: false, label: "LOCKED" });
    expect(s3).toMatchObject({ unlocked: false, label: "LOCKED" });
  });

  it("keeps Step 2 locked until Step 1 is finished with a course picked", () => {
    const courses = [course({ id: "a" }), course({ id: "b", number: "1800", picked: false })];
    expect(stepStatuses({ ...EMPTY_PROGRESS, courses })[1]!.unlocked).toBe(false);

    const [s1, s2] = stepStatuses({ ...EMPTY_PROGRESS, courses, step1Done: true });
    expect(s1).toMatchObject({ done: true, label: "1 OF 2 COUNT" });
    expect(s2).toMatchObject({ unlocked: true, label: "0 OF 1 APPROVED" });
  });

  it("ignores picked courses that don't count", () => {
    const courses = [course({ format: null, picked: true })];
    expect(stepStatuses({ ...EMPTY_PROGRESS, courses, step1Done: true })[1]!.unlocked).toBe(false);
  });

  it("unlocks Step 3 once a course is approved", () => {
    const courses = [course({ id: "a", permission: "approved" }), course({ id: "b", permission: "waiting" })];
    const [, s2, s3] = stepStatuses({ ...EMPTY_PROGRESS, courses, step1Done: true });
    expect(s2).toMatchObject({ done: false, label: "1 OF 2 APPROVED" });
    expect(s3).toMatchObject({ unlocked: true, done: false, label: "1 READY" });
  });

  it("marks Step 3 done after the registration email is sent", () => {
    const courses = [course({ permission: "approved" })];
    const s3 = stepStatuses({ ...EMPTY_PROGRESS, courses, step1Done: true, registrationSent: true })[2];
    expect(s3).toMatchObject({ done: true, label: "SENT" });
  });
});

describe("upcomingTerms", () => {
  it("lists the next three terms that haven't started", () => {
    expect(upcomingTerms(new Date(2026, 10, 12))).toEqual(["Spring 2027", "Summer 2027", "Fall 2027"]);
    expect(upcomingTerms(new Date(2027, 1, 1))).toEqual(["Summer 2027", "Fall 2027", "Spring 2028"]);
    expect(upcomingTerms(new Date(2027, 5, 15))).toEqual(["Fall 2027", "Spring 2028", "Summer 2028"]);
  });
});
