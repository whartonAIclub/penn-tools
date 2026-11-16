import { describe, it, expect } from "vitest";
import type { ToolVisitCount } from "@penntools/core/repositories";
import type { ToolCategory } from "@penntools/core/tools";
import type { CatalogSection, CatalogTool } from "../toolCatalog";
import { topTools } from "../topTools";

function tool(visitId: string): CatalogTool {
  return {
    visitId,
    title: visitId,
    description: "",
    builders: [],
    href: `/tools/${visitId}`,
    external: false,
    beta: false,
    preview: `/dashboard/${visitId}.jpg`,
  };
}

function section(name: ToolCategory, ids: string[]): CatalogSection {
  return { id: name.toLowerCase(), name, beta: false, tools: ids.map(tool) };
}

function count(toolId: string, visits: number, users = 1): ToolVisitCount {
  return { toolId, visits, users };
}

const ids = (ranked: ReturnType<typeof topTools>) => ranked.map((r) => r.tool.visitId);

describe("topTools", () => {
  const sections = [
    section("Recruiting", ["community-quakercal", "keepintouch"]),
    section("Academics", ["career-canvas", "deadline-calendar"]),
    section("Platform", ["askpenn", "platform-playground"]),
  ];

  it("ranks by visits, then by users, then by title, and keeps the top three", () => {
    const counts = [
      count("deadline-calendar", 4, 1),
      count("keepintouch", 9),
      count("community-quakercal", 4, 3),
      count("career-canvas", 4, 1),
    ];
    expect(ids(topTools(counts, sections))).toEqual(["keepintouch", "community-quakercal", "career-canvas"]);
  });

  it("leaves out AskPenn, the Platform Playground, tools no longer on the site and tools with no visits", () => {
    const counts = [
      count("platform-playground", 50),
      count("askpenn", 45),
      count("old-tool", 40),
      count("keepintouch", 2),
      count("career-canvas", 0),
    ];
    expect(topTools(counts, sections)).toEqual([{ tool: tool("keepintouch"), visits: 2, users: 1 }]);
  });

  it("is empty when no one has visited", () => {
    expect(topTools([], sections)).toEqual([]);
  });
});
