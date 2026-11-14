// Reading a WhatsApp "Export chat" text file. The layout differs by phone and
// region:
//   iPhone:  [14/10/2025, 19:32:05] Pat Example: Venue wants a deposit
//   Android: 10/14/25, 7:32 PM - Pat Example: Venue wants a deposit
// Lines that don't start a message continue the one before. Messages without
// a sender ("Pat added Sam"), iPhone's system notices (marked with an
// invisible left-to-right mark) and media placeholders are skipped.

import { MAX_EXCERPT_CHARS, packUnits, type ExcerptDraft } from "./excerpts.js";

export interface ChatMessage {
  /** YYYY-MM-DD */
  date: string;
  sender: string;
  text: string;
}

// [d/m/y, time] sender: text   (iPhone)
const IPHONE_RE = /^\[(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),? ([^\]]+)\] ([^:]+): ([\s\S]*)$/;
// d/m/y, time - sender: text   (Android)
const ANDROID_RE = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),? ([^-]+?) - ([^:]+): ([\s\S]*)$/;
// A line that starts any message, with or without a sender.
const MESSAGE_START_RE = /^\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},? /;

const MEDIA_RE = /^(<Media omitted>|(image|video|audio|sticker|GIF|document) omitted|<attached: .*>)$/i;

/**
 * The chat's messages in order. Whether dates are day-first or month-first is
 * worked out from the file: a first number over 12 means day-first, a second
 * over 12 month-first; with no clue, month-first (US phones).
 */
export function parseWhatsApp(content: string): ChatMessage[] {
  const raw: { a: number; b: number; year: number; sender: string; text: string }[] = [];

  for (const rawLine of content.replace(/^﻿/, "").split(/\r?\n/)) {
    // Direction marks are invisible; strip them except at the start of a
    // message's text, where iPhone marks system notices and media.
    const line = rawLine.replace(/^[‎‏]+/, "").replace(/[‏‪-‮]/g, "");
    const match = IPHONE_RE.exec(line) ?? ANDROID_RE.exec(line);
    if (match) {
      const [, a, b, year, , sender, text] = match;
      const notice = text!.startsWith("‎");
      raw.push({ a: Number(a), b: Number(b), year: fullYear(Number(year)), sender: notice ? "" : sender!.trim(), text: clean(text!) });
    } else if (MESSAGE_START_RE.test(line)) {
      // A message with no sender: someone joined, left or changed a setting.
      raw.push({ a: 0, b: 0, year: 0, sender: "", text: "" });
    } else if (raw.length > 0 && raw[raw.length - 1]!.sender) {
      raw[raw.length - 1]!.text += `\n${clean(line)}`;
    }
  }

  const dayFirst = raw.some((m) => m.a > 12);

  return raw
    .filter((m) => m.sender && m.text.trim() && !MEDIA_RE.test(m.text.trim()))
    .map((m) => {
      const [day, month] = dayFirst ? [m.a, m.b] : [m.b, m.a];
      return { date: `${m.year}-${pad(month)}-${pad(day)}`, sender: m.sender, text: m.text.trim() };
    });
}

/** The chat as excerpts: each day's messages together, split if a day is long. */
export function whatsAppExcerpts(content: string, max = MAX_EXCERPT_CHARS): ExcerptDraft[] {
  const byDay = new Map<string, ChatMessage[]>();
  for (const message of parseWhatsApp(content)) {
    const day = byDay.get(message.date) ?? [];
    day.push(message);
    byDay.set(message.date, day);
  }

  const excerpts: ExcerptDraft[] = [];
  for (const [date, messages] of byDay) {
    for (const text of packUnits(messages.map((m) => `${m.sender}: ${m.text}`), max)) {
      const senders = [...new Set(messages.map((m) => m.sender).filter((s) => text.includes(`${s}:`)))];
      excerpts.push({ text, meta: { date, senders } });
    }
  }
  return excerpts;
}

function clean(text: string): string {
  return text.replace(/‎/g, "").trim();
}

function fullYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
