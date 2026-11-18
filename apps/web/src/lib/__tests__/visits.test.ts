import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MouseEvent } from "react";
import { recordVisit, trackClicks } from "../visits";

const sendBeacon = vi.fn((_url: string, _data: string) => true);

beforeEach(() => {
  sendBeacon.mockClear();
  vi.stubGlobal("navigator", { sendBeacon });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The visit IDs sent so far. */
function sent(): string[] {
  return sendBeacon.mock.calls.map(([url, data]) => {
    expect(url).toBe("/api/visits");
    return (JSON.parse(data) as { toolId: string }).toolId;
  });
}

describe("recordVisit", () => {
  it("sends the visit ID as the route's toolId", () => {
    recordVisit("community-q");
    expect(sent()).toEqual(["community-q"]);
  });

  it("does nothing in a browser without sendBeacon", () => {
    vi.stubGlobal("navigator", {});
    expect(() => recordVisit("askpenn")).not.toThrow();
  });
});

describe("trackClicks", () => {
  const aux = (button: number) => ({ button }) as MouseEvent;

  it("counts a click and a middle-click, but not a right-click", () => {
    const handlers = trackClicks("community-q");
    handlers.onClick();
    handlers.onAuxClick(aux(1));
    handlers.onAuxClick(aux(2));
    expect(sent()).toEqual(["community-q", "community-q"]);
  });
});
