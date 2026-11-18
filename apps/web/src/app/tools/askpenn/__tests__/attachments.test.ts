import { describe, it, expect } from "vitest";
import { uniqueName } from "../attachments";

describe("uniqueName", () => {
  it.each([
    ["image.png", [], "image.png"],
    ["image.png", ["notes.txt"], "image.png"],
    ["image.png", ["image.png"], "image (2).png"],
    ["image.png", ["image.png", "image (2).png"], "image (3).png"],
    ["notes", ["notes"], "notes (2)"],
    [".env", [".env"], ".env (2)"],
    ["a.tar.gz", ["a.tar.gz"], "a.tar (2).gz"],
  ])("names %j, with %j taken, %j", (name, taken, expected) => {
    expect(uniqueName(name, taken)).toBe(expected);
  });
});
