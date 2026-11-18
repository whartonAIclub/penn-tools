import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { communityTools, communityVisitId } from "@/data/communityTools";

const record = vi.fn(async (_toolId: string, _userId: string | null) => {});
const getCurrentUser = vi.fn(async (): Promise<{ id: string } | null> => null);
const logError = vi.fn();

vi.mock("@/lib/container", () => ({
  toolVisits: { record: (toolId: string, userId: string | null) => record(toolId, userId) },
  logger: { error: (msg: string, error: unknown) => logError(msg, error) },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@penntools/core/tools", () => ({
  toolRegistry: { get: (id: string) => (id === "askpenn" ? {} : undefined) },
}));

const { POST } = await import("../route");

/** A request like the one lib/visits.ts's beacon sends: JSON as plain text. */
function beacon(body: string): NextRequest {
  return new NextRequest("http://localhost/api/visits", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body,
  });
}

beforeEach(() => {
  record.mockClear();
  logError.mockClear();
  getCurrentUser.mockResolvedValue(null);
});

describe("POST /api/visits", () => {
  it("records a signed-out visit without a user", async () => {
    const res = await POST(beacon(JSON.stringify({ toolId: "askpenn" })));
    expect(res.status).toBe(204);
    expect(record).toHaveBeenCalledWith("askpenn", null);
  });

  it("records a signed-in visit with the user", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    await POST(beacon(JSON.stringify({ toolId: "askpenn" })));
    expect(record).toHaveBeenCalledWith("askpenn", "user-1");
  });

  it("records a click on a community tool's link under its visit ID", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    const visitId = communityVisitId(communityTools[0]!.id);
    const res = await POST(beacon(JSON.stringify({ toolId: visitId })));
    expect(res.status).toBe(204);
    expect(record).toHaveBeenCalledWith(visitId, "user-1");
  });

  it.each([
    ["an unknown tool", JSON.stringify({ toolId: "no-such-tool" })],
    ["a community tool's bare ID", JSON.stringify({ toolId: communityTools[0]!.id })],
    ["an unknown community tool", JSON.stringify({ toolId: communityVisitId("no-such-tool") })],
    ["a tool ID that isn't a string", JSON.stringify({ toolId: 7 })],
    ["no tool ID", "{}"],
    ["JSON that isn't an object", "null"],
    ["a body that isn't JSON", "askpenn"],
  ])("refuses %s, recording nothing", async (_case, body) => {
    const res = await POST(beacon(body));
    expect(res.status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  it("still answers 204, and logs, when recording fails", async () => {
    record.mockRejectedValueOnce(new Error("database down"));
    const res = await POST(beacon(JSON.stringify({ toolId: "askpenn" })));
    expect(res.status).toBe(204);
    expect(logError).toHaveBeenCalledWith("visits.not_recorded", expect.any(Error));
  });
});
