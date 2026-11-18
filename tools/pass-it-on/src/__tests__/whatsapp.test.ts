// Reading WhatsApp exports, with made-up chats in each phone's layout.

import { describe, it, expect } from "vitest";
import { packUnits } from "../imports/excerpts.js";
import { parseWhatsApp, whatsAppExcerpts } from "../imports/whatsapp.js";

// iPhone, day-first (UK/EU), with the invisible marks iPhone exports include.
const IPHONE = [
  "﻿[03/10/2025, 09:15:02] Pub Board: ‎Messages and calls are end-to-end encrypted.",
  "[03/10/2025, 09:16:40] Pat Example: The bistro wants a $500 deposit",
  "two weeks before the dinner.",
  "[03/10/2025, 09:17:00] Sam Sample: ‎image omitted",
  "‎[14/10/2025, 21:03:11] Sam Sample: Half the RSVPs didn't show",
  "‎[14/10/2025, 21:04:00] Pub Board: ‎Pat Example added Alex Person",
].join("\n");

// Android, month-first (US), 12-hour times.
const ANDROID = [
  "10/3/25, 9:16 AM - Pat Example: Chase Finance Club for their half of the bill",
  "10/14/25, 9:03 PM - Sam Sample: <Media omitted>",
  "10/14/25, 9:04 PM - Messages to this group are now secured with end-to-end encryption.",
  "10/14/25, 9:05 PM - Sam Sample: Moderator only confirmed the day before",
].join("\r\n");

describe("parseWhatsApp", () => {
  it("reads iPhone exports: day-first dates, multi-line messages, no media or system lines", () => {
    expect(parseWhatsApp(IPHONE)).toEqual([
      { date: "2025-10-03", sender: "Pat Example", text: "The bistro wants a $500 deposit\ntwo weeks before the dinner." },
      { date: "2025-10-14", sender: "Sam Sample", text: "Half the RSVPs didn't show" },
    ]);
  });

  it("reads Android exports: month-first dates, two-digit years, no media or system lines", () => {
    expect(parseWhatsApp(ANDROID)).toEqual([
      { date: "2025-10-03", sender: "Pat Example", text: "Chase Finance Club for their half of the bill" },
      { date: "2025-10-14", sender: "Sam Sample", text: "Moderator only confirmed the day before" },
    ]);
  });

  it("returns nothing for text that isn't a chat export", () => {
    expect(parseWhatsApp("Agenda\n- budget\n- venue")).toEqual([]);
  });
});

describe("whatsAppExcerpts", () => {
  it("groups each day's messages into an excerpt with its date and senders", () => {
    expect(whatsAppExcerpts(ANDROID)).toEqual([
      { text: "Pat Example: Chase Finance Club for their half of the bill", meta: { date: "2025-10-03", senders: ["Pat Example"] } },
      { text: "Sam Sample: Moderator only confirmed the day before", meta: { date: "2025-10-14", senders: ["Sam Sample"] } },
    ]);
  });

  it("splits a long day into excerpts under the limit", () => {
    const day = Array.from({ length: 10 }, (_, i) => `10/3/25, 9:${10 + i} AM - Pat Example: message number ${i} about the venue`).join("\n");
    const excerpts = whatsAppExcerpts(day, 120);
    expect(excerpts.length).toBeGreaterThan(1);
    expect(excerpts.every((e) => e.text.length <= 120 && e.meta.date === "2025-10-03")).toBe(true);
    expect(excerpts.map((e) => e.text).join("\n")).toContain("message number 9");
  });
});

describe("packUnits", () => {
  it("packs units up to the limit and cuts a unit that's too long on its own", () => {
    expect(packUnits(["aaa", "bbb", "ccc"], 7)).toEqual(["aaa\nbbb", "ccc"]);
    expect(packUnits(["one two three four"], 9)).toEqual(["one two", "three", "four"]);
    expect(packUnits(["", "  "], 10)).toEqual([]);
  });
});
