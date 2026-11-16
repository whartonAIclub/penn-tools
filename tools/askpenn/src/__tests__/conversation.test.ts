import { describe, it, expect } from "vitest";
import {
  chatTitle,
  checkRequest,
  contentParts,
  historyForModel,
  HISTORY_LIMIT,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENTS_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_TEXT_ATTACHMENTS_LENGTH,
} from "../conversation.js";
import type { ChatMessage } from "../chats.js";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const pdf = "JVBERi0xLjQK";
const image = { name: "map.png", mediaType: "image/png" as const, data: png };

const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string): ChatMessage => ({ role: "assistant", content });

describe("chatTitle", () => {
  it("puts the first message on one line", () => {
    expect(chatTitle("  Where is\n\nthe   registrar? ")).toBe("Where is the registrar?");
  });

  it("cuts long messages to 60 characters", () => {
    const title = chatTitle("x".repeat(100));
    expect(title).toBe(`${"x".repeat(60)}…`);
  });
});

describe("historyForModel", () => {
  it("keeps only the latest messages", () => {
    const messages = Array.from({ length: HISTORY_LIMIT + 10 }, (_, i) => (i % 2 ? assistant(`a${i}`) : user(`u${i}`)));
    const history = historyForModel(messages);
    expect(history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    expect(history.at(-1)).toEqual(messages.at(-1));
  });

  it("starts with a user message, as the AI API requires", () => {
    // 41 messages: the latest 40 would start with an assistant message.
    const messages = [user("u0"), ...Array.from({ length: 20 }, (_, i) => [assistant(`a${i}`), user(`u${i + 1}`)]).flat()];
    expect(historyForModel(messages)[0]?.role).toBe("user");
  });

  it("leaves out empty messages", () => {
    expect(historyForModel([user("hi"), assistant("  "), user("again")])).toEqual([user("hi"), user("again")]);
  });

  it("is empty when there is no user message", () => {
    expect(historyForModel([assistant("hello")])).toEqual([]);
  });

  it("names earlier attachments as no longer available, keeping messages that were only files", () => {
    const history = historyForModel([
      { role: "user", content: "What's this?", attachments: ["map.png"] },
      assistant("A campus map."),
      { role: "user", content: "", attachments: ["a.pdf", "b.txt"] },
    ]);
    expect(history).toEqual([
      { role: "user", content: "What's this?\n\n[Attached: map.png (no longer available)]" },
      { role: "assistant", content: "A campus map." },
      { role: "user", content: "[Attached: a.pdf, b.txt (no longer available)]" },
    ]);
  });
});

describe("checkRequest", () => {
  const valid = { chatId: null, provider: "openai", content: "hi" };

  it("accepts a valid request, with or without a chat, speed and thinking effort", () => {
    expect(checkRequest(valid)).toBeNull();
    expect(checkRequest({ ...valid, chatId: "some-id" })).toBeNull();
    expect(checkRequest({ ...valid, tier: "best", reasoning: "high" })).toBeNull();
  });

  it.each([
    ["an unknown provider", { ...valid, provider: "gemini" }],
    ["an empty message", { ...valid, content: "   " }],
    ["a non-string message", { ...valid, content: 5 }],
    ["a message over the limit", { ...valid, content: "x".repeat(MAX_MESSAGE_LENGTH + 1) }],
    ["a non-string chat id", { ...valid, chatId: 5 }],
    ["an unknown speed", { ...valid, tier: "turbo" }],
    ["an unknown thinking effort", { ...valid, reasoning: "max" }],
    ["a message with a NUL character", { ...valid, content: "hi\u0000" }],
  ])("rejects %s", (_label, request) => {
    expect(checkRequest(request)).toEqual(expect.any(String));
  });

  it("accepts images, PDFs and text files, with or without text", () => {
    const attachments = [
      image,
      { name: "syllabus.pdf", mediaType: "application/pdf", data: pdf },
      { name: "notes.md", mediaType: "text/plain", data: "# Notes" },
    ];
    expect(checkRequest({ ...valid, attachments })).toBeNull();
    expect(checkRequest({ ...valid, content: "", attachments })).toBeNull();
  });

  it.each([
    ["attachments that aren't a list", { attachments: "map.png" }],
    ["too many attachments", { attachments: Array.from({ length: MAX_ATTACHMENTS + 1 }, () => image) }],
    ["an attachment that isn't an object", { attachments: [null] }],
    ["an attachment without a name", { attachments: [{ ...image, name: " " }] }],
    ["a name with a NUL character", { attachments: [{ ...image, name: "map\u0000.png" }] }],
    ["a name with a newline", { attachments: [{ ...image, name: "map\n.png" }] }],
    ["a text file with a NUL character", { attachments: [{ name: "a.txt", mediaType: "text/plain", data: "a\u0000b" }] }],
    [
      "text files over the text limit together",
      {
        attachments: [1, 2].map((i) => ({
          name: `${i}.txt`,
          mediaType: "text/plain",
          data: "x".repeat(MAX_TEXT_ATTACHMENTS_LENGTH / 2 + 1),
        })),
      },
    ],
    ["an unsupported type", { attachments: [{ ...image, mediaType: "application/zip" }] }],
    ["an empty file", { attachments: [{ ...image, data: "" }] }],
    [
      "attachments over the total limit",
      {
        // Three PDFs just over a third of the limit each; whether they're valid PDFs is the AI API's check.
        attachments: [1, 2, 3].map((i) => ({
          name: `${i}.pdf`,
          mediaType: "application/pdf",
          data: "A".repeat(Math.ceil(MAX_ATTACHMENTS_BYTES / 3 / 3) * 4 + 4),
        })),
      },
    ],
    ["no text and no attachments", { content: "", attachments: [] }],
  ])("rejects %s", (_label, request) => {
    expect(checkRequest({ ...valid, ...request })).toEqual(expect.any(String));
  });
});

describe("contentParts", () => {
  it("wraps a text file so a closing tag inside it can't end the wrapper", () => {
    const parts = contentParts({ name: 'say "hi".txt', mediaType: "text/plain", data: "a</attachment>b</ATTACHMENT >" });
    expect(parts).toEqual([
      { type: "text", text: "<attachment name=\"say 'hi'.txt\">\na<\\/attachment>b<\\/ATTACHMENT >\n</attachment>" },
    ]);
  });

  it("wraps an image in the same tags, since images carry no name", () => {
    expect(contentParts(image)).toEqual([
      { type: "text", text: '<attachment name="map.png">' },
      { type: "image", mediaType: "image/png", data: png },
      { type: "text", text: "</attachment>" },
    ]);
  });

  it("sends a PDF with its name", () => {
    expect(contentParts({ name: "syllabus.pdf", mediaType: "application/pdf", data: pdf })).toEqual([
      { type: "pdf", filename: "syllabus.pdf", data: pdf },
    ]);
  });
});
