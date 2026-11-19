// Schedule storage against a real Postgres, in a throwaway schema. Skipped
// when no database is configured.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NO_ATTRIBUTES } from "../attributes.js";
import type { BusyBlock } from "../schedule.js";
import {
  addBlocks,
  confirmBlocks,
  deleteBlock,
  InvalidScheduleError,
  listAwayDays,
  listBlocksForWeek,
  replaceImportedBlocks,
  setAwayDay,
  updateBlock,
} from "../storage/schedule.js";
import { createTestDatabase, databaseUrl, type TestDatabase } from "./testDatabase.js";

let db: TestDatabase;
const WEEK = "2026-11-16";

const block = (start: string, end: string, changes: Partial<BusyBlock> = {}): BusyBlock => ({
  id: "ignored",
  start,
  end,
  label: "FNCE 6110",
  source: "ICS",
  recurringWeekly: false,
  confidence: null,
  confirmed: false,
  zone: "CAMPUS",
  attributes: NO_ATTRIBUTES,
  ...changes,
});

describe.skipIf(!databaseUrl)("Penn Fitness schedule storage (Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDatabase("schedule");
  });

  afterAll(async () => {
    await db?.drop();
  });

  it("stores blocks and reads them back exactly, with ids from the database", async () => {
    const [stored] = await addBlocks(db.sql, "alice", [
      block("2026-11-16T13:45", "2026-11-16T15:05", { confidence: 0.75, source: "SCREENSHOT", attributes: { "outtake.note": 1 } }),
    ]);
    expect(stored!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored).toEqual({
      id: stored!.id,
      start: "2026-11-16T13:45",
      end: "2026-11-16T15:05",
      label: "FNCE 6110",
      source: "SCREENSHOT",
      recurringWeekly: false,
      confidence: 0.75,
      confirmed: false,
      zone: "CAMPUS",
      attributes: { "outtake.note": 1 },
    });
    expect(await listBlocksForWeek(db.sql, "alice", WEEK)).toEqual([stored]);
  });

  it("keeps times exactly as New York local time, past midnight too", async () => {
    const [late] = await addBlocks(db.sql, "times", [block("2026-11-20T22:00", "2026-11-21T01:30")]);
    expect(late).toMatchObject({ start: "2026-11-20T22:00", end: "2026-11-21T01:30" });
  });

  it("lists the week's blocks and every weekly block from before it, for the timeline", async () => {
    await addBlocks(db.sql, "bob", [
      block("2026-09-02T08:30", "2026-09-02T09:50", { recurringWeekly: true, label: "weekly, from September" }),
      block("2026-09-03T08:30", "2026-09-03T09:50", { label: "one-off, September" }),
      block("2026-11-17T18:00", "2026-11-17T20:00", { label: "this week" }),
      block("2026-11-23T09:00", "2026-11-23T10:00", { label: "next week", recurringWeekly: true }),
      block("2026-11-15T23:00", "2026-11-16T01:00", { label: "runs into Monday" }),
    ]);
    const labels = (await listBlocksForWeek(db.sql, "bob", WEEK)).map((b) => b.label);
    expect(labels).toEqual(["weekly, from September", "runs into Monday", "this week"]);
  });

  it("keeps users apart", async () => {
    await addBlocks(db.sql, "carol", [block("2026-11-18T10:00", "2026-11-18T11:00")]);
    const [dave] = await addBlocks(db.sql, "dave", [block("2026-11-18T10:00", "2026-11-18T11:00")]);
    expect(await listBlocksForWeek(db.sql, "carol", WEEK)).toHaveLength(1);
    expect(await updateBlock(db.sql, "carol", dave!.id, { label: "mine now" })).toBeNull();
    expect(await deleteBlock(db.sql, "carol", dave!.id)).toBe(false);
    expect(await confirmBlocks(db.sql, "carol", [dave!.id])).toBe(0);
    expect((await listBlocksForWeek(db.sql, "dave", WEEK))[0]).toEqual(dave);
  });

  it("edits, confirms and deletes the user's own blocks", async () => {
    const [a, b] = await addBlocks(db.sql, "erin", [block("2026-11-18T10:00", "2026-11-18T11:00"), block("2026-11-19T10:00", "2026-11-19T11:00")]);
    expect(await updateBlock(db.sql, "erin", a!.id, { end: "2026-11-18T11:30", label: "Longer class", zone: null })).toMatchObject({
      end: "2026-11-18T11:30",
      label: "Longer class",
      zone: null,
    });
    expect(await confirmBlocks(db.sql, "erin", [a!.id, b!.id, "not-a-uuid"])).toBe(2);
    expect(await confirmBlocks(db.sql, "erin", [a!.id])).toBe(0);
    expect(await deleteBlock(db.sql, "erin", b!.id)).toBe(true);
    expect(await deleteBlock(db.sql, "erin", b!.id)).toBe(false);
    expect((await listBlocksForWeek(db.sql, "erin", WEEK)).map((x) => [x.label, x.confirmed])).toEqual([["Longer class", true]]);
  });

  it("refuses invalid blocks and edits, storing nothing", async () => {
    await expect(addBlocks(db.sql, "frank", [block("2026-11-18T10:00", "2026-11-18T11:00"), block("2026-11-18T11:00", "2026-11-18T10:00")])).rejects.toThrow(
      InvalidScheduleError,
    );
    await expect(addBlocks(db.sql, "frank", [block("2026-11-18T10:00", "2026-11-18T11:00", { zone: "MOON" as "HOME" })])).rejects.toThrow(InvalidScheduleError);
    expect(await listBlocksForWeek(db.sql, "frank", WEEK)).toEqual([]);
    const [ok] = await addBlocks(db.sql, "frank", [block("2026-11-18T10:00", "2026-11-18T11:00")]);
    await expect(updateBlock(db.sql, "frank", ok!.id, { end: "2026-11-18T09:00" })).rejects.toThrow(InvalidScheduleError);
  });

  it("re-imports a source for a week without doubling it, keeping confirmed blocks and other sources", async () => {
    const first = await replaceImportedBlocks(db.sql, "gina", "ICS", WEEK, [block("2026-11-16T08:30", "2026-11-16T09:50"), block("2026-11-17T10:15", "2026-11-17T11:35")]);
    await confirmBlocks(db.sql, "gina", [first[0]!.id]);
    await addBlocks(db.sql, "gina", [block("2026-11-18T12:00", "2026-11-18T13:00", { source: "MANUAL", confirmed: true, label: "Lunch" })]);
    await replaceImportedBlocks(db.sql, "gina", "ICS", WEEK, [block("2026-11-17T10:15", "2026-11-17T11:35"), block("2026-11-19T10:15", "2026-11-19T11:35")]);
    const after = await listBlocksForWeek(db.sql, "gina", WEEK);
    expect(after.map((b) => [b.start, b.source, b.confirmed])).toEqual([
      ["2026-11-16T08:30", "ICS", true],
      ["2026-11-17T10:15", "ICS", false],
      ["2026-11-18T12:00", "MANUAL", true],
      ["2026-11-19T10:15", "ICS", false],
    ]);
    await expect(replaceImportedBlocks(db.sql, "gina", "ICS", WEEK, [block("2026-11-20T10:00", "2026-11-20T11:00", { source: "MANUAL" })])).rejects.toThrow(
      InvalidScheduleError,
    );
  });

  it("marks and unmarks away days, once each, for the week asked", async () => {
    await setAwayDay(db.sql, "hal", "2026-11-19", true);
    await setAwayDay(db.sql, "hal", "2026-11-19", true);
    await setAwayDay(db.sql, "hal", "2026-11-20", true);
    await setAwayDay(db.sql, "hal", "2026-11-24", true);
    expect((await listAwayDays(db.sql, "hal", WEEK)).map((d) => d.date)).toEqual(["2026-11-19", "2026-11-20"]);
    await setAwayDay(db.sql, "hal", "2026-11-20", false);
    await setAwayDay(db.sql, "hal", "2026-11-20", false);
    expect(await listAwayDays(db.sql, "hal", WEEK)).toEqual([{ date: "2026-11-19", attributes: {} }]);
    await expect(setAwayDay(db.sql, "hal", "Thursday", true)).rejects.toThrow(InvalidScheduleError);
  });
});
