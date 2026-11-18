import { describe, it, expect } from "vitest";
import { readBodyText } from "../readBody";

/** A request whose body arrives in chunks, with no Content-Length, as a streamed upload does. */
function streamed(chunks: string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("http://localhost/x", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("readBodyText", () => {
  it("returns a body within the limit", async () => {
    expect(await readBodyText(new Request("http://localhost/x", { method: "POST", body: "héllo" }), 100)).toBe("héllo");
    expect(await readBodyText(streamed(["ab", "cd"]), 4)).toBe("abcd");
  });

  it("refuses a body whose Content-Length is over the limit, without reading it", async () => {
    const req = new Request("http://localhost/x", { method: "POST", body: "x".repeat(50) });
    expect(await readBodyText(req, 10)).toBeNull();
  });

  it("refuses a body that grows past the limit while it's read", async () => {
    expect(await readBodyText(streamed(["abc", "def"]), 5)).toBeNull();
  });

  it("reads a request without a body as empty", async () => {
    expect(await readBodyText(new Request("http://localhost/x", { method: "POST" }), 10)).toBe("");
  });
});
