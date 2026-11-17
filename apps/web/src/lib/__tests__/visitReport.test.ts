import { describe, it, expect } from "vitest";
import type { ToolVisits } from "@penntools/core/repositories";
import type { ToolManifest } from "@penntools/core/tools";
import type { CommunityTool } from "../../data/communityTools";
import { visitsForEveryTool } from "../visitReport";

function manifest(id: string): ToolManifest {
  return { id, title: id, description: "", contributors: [], category: "Other" };
}

function community(id: string): CommunityTool {
  return { id, title: id, description: "", category: "Other", builder: "", url: `https://${id}.example` };
}

function row(toolId: string, recentVisits: number): ToolVisits {
  return { toolId, visits: recentVisits + 1, users: 1, recentVisits, recentUsers: 1 };
}

const ids = (rows: ToolVisits[]) => rows.map((r) => r.toolId);

describe("visitsForEveryTool", () => {
  const manifests = [manifest("a"), manifest("b"), manifest("c")];
  const tools = [community("x"), community("y")];
  const everyTool = ["a", "b", "c", "community-x", "community-y"];

  it("keeps the report's order, then adds unvisited tools with zeros, registered before community", () => {
    const rows = visitsForEveryTool([row("c", 5), row("community-y", 2)], manifests, tools, { onlySiteTools: true });
    expect(ids(rows)).toEqual(["c", "community-y", "a", "b", "community-x"]);
    expect(rows[2]).toEqual({ toolId: "a", visits: 0, users: 0, recentVisits: 0, recentUsers: 0 });
    expect(rows[0]).toEqual(row("c", 5));
  });

  it("leaves out IDs no longer on the site only when asked to", () => {
    const visited = [row("old-name", 9), row("a", 3)];
    expect(ids(visitsForEveryTool(visited, manifests, tools, { onlySiteTools: true }))).toEqual(everyTool);
    expect(ids(visitsForEveryTool(visited, manifests, tools, { onlySiteTools: false }))).toEqual([
      "old-name",
      ...everyTool,
    ]);
  });

  it("lists every tool when there are no visits yet", () => {
    expect(ids(visitsForEveryTool([], manifests, tools, { onlySiteTools: true }))).toEqual(everyTool);
  });
});
