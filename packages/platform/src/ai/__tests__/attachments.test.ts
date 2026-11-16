// The image helpers in @penntools/core/ai (core has no tests of its own).

import { describe, it, expect } from "vitest";
import {
  IMAGE_PATCH_SIZE,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_PATCHES,
  base64Bytes,
  base64FileType,
  fileType,
  imageFitSize,
  isBase64,
} from "@penntools/core/ai";

const patches = ({ width, height }: { width: number; height: number }) =>
  Math.ceil(width / IMAGE_PATCH_SIZE) * Math.ceil(height / IMAGE_PATCH_SIZE);

describe("imageFitSize", () => {
  // Expected sizes from Claude's vision docs.
  it.each([
    [200, 200, 200, 200],
    [2000, 1500, 2000, 1500],
    [3840, 2160, 2576, 1449],
  ])("fits %ix%i to %ix%i", (width, height, fitWidth, fitHeight) => {
    expect(imageFitSize(width, height)).toEqual({ width: fitWidth, height: fitHeight });
  });

  it.each([
    [3000, 3000],
    [4032, 3024],
    [10000, 100],
    [100, 10000],
  ])("keeps %ix%i within both limits and its aspect ratio", (width, height) => {
    const fit = imageFitSize(width, height);
    expect(Math.max(fit.width, fit.height)).toBeLessThanOrEqual(MAX_IMAGE_EDGE);
    expect(patches(fit)).toBeLessThanOrEqual(MAX_IMAGE_PATCHES);
    expect(Math.abs(fit.width / fit.height / (width / height) - 1)).toBeLessThan(0.02);
  });

  it.each([
    [3000, 3000],
    [4032, 3024],
  ])("shrinks %ix%i, which has too many patches, little further than it must", (width, height) => {
    expect(patches(imageFitSize(width, height))).toBeGreaterThan(MAX_IMAGE_PATCHES * 0.95);
  });
});

describe("fileType", () => {
  const bytes = (header: string) => Uint8Array.from(header, (char) => char.charCodeAt(0));

  it.each([
    ["\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01", "image/jpeg"],
    ["\x89PNG\r\n\x1a\n\x00\x00\x00\x0d", "image/png"],
    ["GIF89a\x01\x00\x01\x00\x80\x00", "image/gif"],
    ["GIF87a\x01\x00\x01\x00\x80\x00", "image/gif"],
    ["RIFF\x24\x00\x00\x00WEBP", "image/webp"],
    ["%PDF-1.7\n%\xe2\xe3", "application/pdf"],
    ["%PDF-", "application/pdf"],
  ])("reads %j as %s", (header, type) => {
    expect(fileType(bytes(header))).toBe(type);
  });

  it.each([
    ["a WAV file, also RIFF", "RIFF\x24\x00\x00\x00WAVE"],
    ["an AVI file, also RIFF", "RIFF\x24\x00\x00\x00AVI "],
    ["a PNG without its full signature", "\x89PNG\x00\x00\x00\x00\x00\x00\x00\x00"],
    ["a ZIP (and so an Office file)", "PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00"],
    ["text", "hello, world"],
    ["nothing", ""],
  ])("reads %s as none of them", (_label, header) => {
    expect(fileType(bytes(header))).toBeNull();
  });
});

describe("base64FileType", () => {
  it.each([
    ["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "image/png"],
    ["JVBERi0xLjQK", "application/pdf"],
    ["UklGRiQAAABXRUJQ", "image/webp"],
    ["UklGRiQAAABXQVZF", null], // a WAV file
    ["", null],
    ["not base64!", null],
  ])("reads %j as %s", (data, type) => {
    expect(base64FileType(data)).toBe(type);
  });
});

describe("isBase64", () => {
  it.each(["", "YQ==", "YWI=", "YWJj", "a+b/"])("accepts %j", (data) => {
    expect(isBase64(data)).toBe(true);
  });

  it.each(["YQ", "YQ=", "Y Q==", "YQ==YQ==", "data:image/png;base64,YWJj", "YW-j"])("rejects %j", (data) => {
    expect(isBase64(data)).toBe(false);
  });
});

describe("base64Bytes", () => {
  it.each([
    ["", 0],
    ["YQ==", 1],
    ["YWI=", 2],
    ["YWJj", 3],
  ])("counts %j as %i bytes", (data, bytes) => {
    expect(base64Bytes(data)).toBe(bytes);
  });
});
