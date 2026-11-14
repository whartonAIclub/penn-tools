// Each adapter, through createAI: how replies map to results, streams and
// objects, and how failures surface.

import { describe, it, expect, beforeEach } from "vitest";
import { z } from "@penntools/core/ai";
import type { AIProvider, AIStreamEvent } from "@penntools/core/ai";
import { createAI } from "../createAI.js";
import { installFakeFetch, silentLogger, type FakeReply } from "./fakeFetch.js";
import {
  anthropicErrorReply,
  anthropicEvents,
  anthropicMessage,
  anthropicReply,
  openaiErrorReply,
  openaiReply,
} from "./replies.js";

const ai = createAI({
  getKey: async (provider) => `key-${provider}`,
  listProviders: async () => ["openai", "anthropic"],
  credit: null,
  recordUsage: async () => {},
  logger: silentLogger,
});
const hi = [{ role: "user" as const, content: "hi" }];

const Tasks = z.object({
  tasks: z.array(z.object({ title: z.string(), due: z.string().nullable() })),
});
const tasks = { tasks: [{ title: "Essay", due: null }] };

let net: ReturnType<typeof installFakeFetch>;
beforeEach(() => {
  net = installFakeFetch();
});

async function collect(provider: AIProvider) {
  const events: AIStreamEvent[] = [];
  for await (const event of ai.stream({ provider, messages: hi })) events.push(event);
  return events;
}

describe("Anthropic", () => {
  it("joins text blocks, skips thinking blocks and reports usage", async () => {
    net.reply(anthropicReply({ text: ["Hel", "lo"], thinking_tokens: 5 }));
    expect(await ai.generate({ provider: "anthropic", messages: hi })).toEqual({
      text: "Hello",
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 10, outputTokens: 7, reasoningTokens: 5 },
      stopReason: "end",
    });
  });

  it.each([
    ["end_turn", "end"],
    ["stop_sequence", "end"],
    ["max_tokens", "max_tokens"],
    ["model_context_window_exceeded", "max_tokens"],
    ["refusal", "refusal"],
  ])("maps stop_reason %s to %s", async (stop_reason, expected) => {
    net.reply(anthropicReply({ stop_reason }));
    expect((await ai.generate({ provider: "anthropic", messages: hi })).stopReason).toBe(expected);
  });

  it("streams text deltas, then the full result", async () => {
    net.reply(anthropicReply({ text: ["Hel", "lo"], thinking_tokens: 1 }));
    const events = await collect("anthropic");
    expect(net.last().body.stream).toBe(true);
    expect(events.slice(0, 2)).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
    ]);
    expect(events[2]).toMatchObject({ type: "done", result: { text: "Hello", stopReason: "end", usage: { outputTokens: 7, reasoningTokens: 1 } } });
  });

  it("sends the schema as structured output and returns the checked object", async () => {
    net.reply(anthropicReply({ text: JSON.stringify(tasks) }));
    const result = await ai.generateObject({ provider: "anthropic", schema: Tasks, messages: hi });

    expect(result.object).toEqual(tasks);
    const format = net.last().body.output_config.format;
    expect(format.type).toBe("json_schema");
    expect(format.schema.properties.tasks.items.required).toEqual(["title", "due"]);
  });

  it("streams generate() too, so long outputs aren't refused by the SDK", async () => {
    net.reply(anthropicReply());
    await ai.generate({ provider: "anthropic", maxOutputTokens: 64_000, messages: hi });
    expect(net.last().body).toMatchObject({ stream: true, max_tokens: 64_000 });
  });

  it("maps HTTP errors to AIError kinds", async () => {
    net.reply(anthropicErrorReply(401, "authentication_error", "invalid x-api-key"));
    await expect(ai.generate({ provider: "anthropic", messages: hi })).rejects.toMatchObject({ kind: "invalid_key" });
  });

  it("maps an error sent partway through the stream by its type", async () => {
    const [start] = anthropicEvents(anthropicMessage());
    net.reply({ events: [start!, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }] });
    await expect(ai.generate({ provider: "anthropic", messages: hi })).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("OpenAI", () => {
  it("returns the output text and usage", async () => {
    net.reply(openaiReply({ text: "Hello", reasoning_tokens: 6 }));
    expect(await ai.generate({ provider: "openai", messages: hi })).toEqual({
      text: "Hello",
      provider: "openai",
      model: "gpt-6.1-sol",
      usage: { inputTokens: 12, outputTokens: 9, reasoningTokens: 6 },
      stopReason: "end",
    });
  });

  it.each([
    [{ status: "completed" as const }, "end"],
    [{ status: "incomplete" as const, incomplete_reason: "max_output_tokens" }, "max_tokens"],
    [{ status: "incomplete" as const, incomplete_reason: "content_filter" }, "refusal"],
    [{ refusal: true }, "refusal"],
  ])("maps %o to stopReason %s", async (reply, expected) => {
    net.reply(openaiReply(reply));
    expect((await ai.generate({ provider: "openai", messages: hi })).stopReason).toBe(expected);
  });

  it("streams text deltas, then the full result", async () => {
    net.reply(openaiReply({ text: "Hello" }, ["Hel", "lo"]));
    const events = await collect("openai");
    expect(net.last().body.stream).toBe(true);
    expect(events.slice(0, 2)).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
    ]);
    expect(events[2]).toMatchObject({ type: "done", result: { text: "Hello", stopReason: "end" } });
  });

  it("sends the schema as strict structured output and returns the checked object", async () => {
    net.reply(openaiReply({ text: JSON.stringify(tasks) }));
    const result = await ai.generateObject({ provider: "openai", schema: Tasks, messages: hi });

    expect(result.object).toEqual(tasks);
    expect(net.last().body.text.format).toMatchObject({ type: "json_schema", name: "result", strict: true });
  });

  it("maps HTTP errors to AIError kinds", async () => {
    net.reply(openaiErrorReply(429, "insufficient_quota", "You exceeded your current quota"));
    await expect(ai.generate({ provider: "openai", messages: hi })).rejects.toMatchObject({ kind: "no_credit" });
  });

  it.each([
    ["server_error", "unavailable"],
    ["rate_limit_exceeded", "rate_limited"],
  ])("treats a failed response (%s) as an error, not a finished reply", async (error_code, kind) => {
    net.reply(openaiReply({ status: "failed", error_code, text: "partial" }));
    await expect(ai.generate({ provider: "openai", messages: hi })).rejects.toMatchObject({ kind, provider: "openai" });
  });
});

describe("images and PDFs", () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
  const pdf = "JVBERi0xLjQK";
  const withFiles = [
    {
      role: "user" as const,
      content: [
        { type: "image" as const, mediaType: "image/png" as const, data: png },
        { type: "pdf" as const, filename: "syllabus.pdf", data: pdf },
        { type: "text" as const, text: "Summarize these." },
      ],
    },
  ];

  it("sends them to Anthropic as base64 image and document blocks", async () => {
    net.reply(anthropicReply());
    await ai.generate({ provider: "anthropic", messages: withFiles });
    expect(net.last().body.messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: png } },
      { type: "document", title: "syllabus.pdf", source: { type: "base64", media_type: "application/pdf", data: pdf } },
      { type: "text", text: "Summarize these." },
    ]);
  });

  it("sends them to OpenAI as data URLs", async () => {
    net.reply(openaiReply());
    await ai.generate({ provider: "openai", messages: withFiles });
    expect(net.last().body.input[0].content).toEqual([
      { type: "input_image", detail: "auto", image_url: `data:image/png;base64,${png}` },
      { type: "input_file", filename: "syllabus.pdf", file_data: `data:application/pdf;base64,${pdf}` },
      { type: "input_text", text: "Summarize these." },
    ]);
  });

  it("still sends plain-text messages as strings", async () => {
    net.reply(anthropicReply());
    await ai.generate({ provider: "anthropic", messages: hi });
    expect(net.last().body.messages[0].content).toBe("hi");
  });

  it.each([
    ["data that isn't base64", [{ type: "image", mediaType: "image/png", data: "not base64!" }]],
    ["an unsupported image type", [{ type: "image", mediaType: "image/heic", data: png }]],
    [
      "an image over the size limit",
      [{ type: "image", mediaType: "image/png", data: `iVBORw0KGgo${"A".repeat(10 * 1024 * 1024 + 1)}` }],
    ],
    ["a data: prefix", [{ type: "image", mediaType: "image/png", data: `data:image/png;base64,${png}` }]],
    ["a PNG labelled a JPEG", [{ type: "image", mediaType: "image/jpeg", data: png }]],
    // "RIFF....WAVE": a WAV file, which starts like a WebP but isn't one.
    ["a WAV labelled a WebP", [{ type: "image", mediaType: "image/webp", data: "UklGRiQAAABXQVZF" }]],
    ["a PNG sent as a PDF", [{ type: "pdf", filename: "map.pdf", data: png }]],
    ["a PDF without a filename", [{ type: "pdf", filename: "", data: pdf }]],
    ["no parts", []],
  ])("rejects %s without calling the provider", async (_label, content) => {
    const messages = [{ role: "user", content }] as unknown as typeof withFiles;
    await expect(ai.generate({ provider: "openai", messages })).rejects.toMatchObject({ kind: "bad_request" });
    expect(net.sent).toHaveLength(0);
  });

  it("rejects files in an assistant message", async () => {
    const messages = [...hi, { role: "assistant", content: [{ type: "text", text: "hi" }] }] as unknown as typeof withFiles;
    await expect(ai.generate({ provider: "anthropic", messages })).rejects.toMatchObject({ kind: "bad_request" });
  });
});

describe("generateObject failures", () => {
  const cases: [string, AIProvider, () => FakeReply, string][] = [
    ["a reply that isn't JSON", "anthropic", () => anthropicReply({ text: "not json" }), "bad_output"],
    ["a reply that doesn't match the schema", "anthropic", () => anthropicReply({ text: '{"tasks":[{"title":5}]}' }), "bad_output"],
    ["a cut-off reply", "anthropic", () => anthropicReply({ text: '{"tasks":[', stop_reason: "max_tokens" }), "bad_output"],
    ["a refusal", "anthropic", () => anthropicReply({ text: "", stop_reason: "refusal" }), "refused"],
    ["a reply that isn't JSON", "openai", () => openaiReply({ text: "not json" }), "bad_output"],
    ["a cut-off reply", "openai", () => openaiReply({ text: '{"tasks":[', status: "incomplete", incomplete_reason: "max_output_tokens" }), "bad_output"],
    ["a refusal", "openai", () => openaiReply({ refusal: true }), "refused"],
  ];

  it.each(cases)("turns %s from %s into %s", async (_label, provider, reply, kind) => {
    net.reply(reply());
    await expect(ai.generateObject({ provider, schema: Tasks, messages: hi })).rejects.toMatchObject({ kind, provider });
  });

  it("rejects a schema that isn't a z.object", async () => {
    const schema = z.array(z.string()) as unknown as typeof Tasks;
    await expect(ai.generateObject({ provider: "openai", schema, messages: hi })).rejects.toMatchObject({ kind: "bad_request" });
    expect(net.sent).toHaveLength(0);
  });
});

describe("failures partway through", () => {
  it.each(["anthropic", "openai"] as const)("turns a connection dropped mid-stream on %s into unavailable", async (provider) => {
    const reply = provider === "anthropic" ? anthropicReply() : openaiReply();
    net.reply({ events: reply.events.slice(0, 2), drop: true });
    await expect(ai.generate({ provider, messages: hi })).rejects.toMatchObject({ kind: "unavailable", provider });
  });

  it.each(["anthropic", "openai"] as const)("turns a %s stream that ends without a result into unavailable", async (provider) => {
    const reply = provider === "anthropic" ? anthropicReply() : openaiReply();
    net.reply({ events: reply.events.slice(0, 2) });
    await expect(ai.generate({ provider, messages: hi })).rejects.toMatchObject({ kind: "unavailable", provider });
  });

  it("stream() yields the text it got, then throws an AIError", async () => {
    net.reply({ events: anthropicReply({ text: "partial" }).events.slice(0, 6), drop: true });
    const deltas: string[] = [];
    const error = await (async () => {
      for await (const event of ai.stream({ provider: "anthropic", messages: hi })) {
        if (event.type === "text") deltas.push(event.delta);
      }
    })().catch((e: unknown) => e);
    expect(deltas).toEqual(["partial"]);
    expect(error).toMatchObject({ kind: "unavailable" });
  });
});
