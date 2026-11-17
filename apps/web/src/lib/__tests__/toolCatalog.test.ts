import { describe, it, expect } from "vitest";
import type { ToolCategory, ToolManifest } from "@penntools/core/tools";
import { isCommunityVisitId } from "../../data/communityTools";
import type { CommunityTool } from "../../data/communityTools";
import { fullWidthToolIds, toolCatalog, toolInfo } from "../toolCatalog";

function manifest(id: string, category: ToolCategory, flags: Partial<ToolManifest> = {}): ToolManifest {
  return { id, title: id, description: "", contributors: [], category, ...flags };
}

function community(id: string, category: ToolCategory): CommunityTool {
  return { id, title: id, description: "", category, builder: "", url: `https://${id}.example` };
}

const outline = (sections: ReturnType<typeof toolCatalog>) =>
  sections.map((s) => [s.name, s.tools.map((t) => t.title)]);

describe("toolCatalog", () => {
  it("orders sections as TOOL_CATEGORIES does and leaves out empty ones", () => {
    const sections = toolCatalog(
      [manifest("pg", "Platform"), manifest("a", "Other")],
      [community("p", "Productivity"), community("r", "Recruiting")],
    );
    expect(sections.map((s) => [s.id, s.name])).toEqual([
      ["recruiting", "Recruiting"],
      ["productivity", "Productivity"],
      ["other", "Other"],
      ["platform", "Platform"],
    ]);
  });

  it("puts each tool in its category: community tools first, then registered ones in registration order", () => {
    const sections = toolCatalog(
      [manifest("b", "Recruiting"), manifest("a", "Recruiting")],
      [community("q", "Recruiting")],
    );
    expect(outline(sections)).toEqual([["Recruiting", ["q", "b", "a"]]]);
  });

  it("shows a tool as beta when its manifest says so or it hasn't migrated, and never a community tool", () => {
    const tools = toolCatalog(
      [
        manifest("done", "Other"),
        manifest("trying", "Other", { beta: true }),
        manifest("legacy", "Other", { notYetMigrated: true }),
      ],
      [community("q", "Other")],
    ).flatMap((s) => s.tools);
    expect(Object.fromEntries(tools.map((t) => [t.visitId, t.beta]))).toEqual({
      "community-q": false,
      done: false,
      trying: true,
      legacy: true,
    });
  });

  it("marks a section beta only when every tool in it is", () => {
    const sections = toolCatalog(
      [
        manifest("a", "Other", { notYetMigrated: true }),
        manifest("b", "Other", { beta: true }),
        manifest("c", "Platform", { beta: true }),
        manifest("d", "Platform"),
      ],
      [],
    );
    expect(sections.map((s) => [s.name, s.beta])).toEqual([
      ["Other", true],
      ["Platform", false],
    ]);
  });

  it("links registered tools to their pages and community tools out", () => {
    const tools = toolCatalog([manifest("a", "Academics")], [community("q", "Academics")]).flatMap((s) => s.tools);
    expect(tools.map((t) => [t.href, t.external])).toEqual([
      ["https://q.example", true],
      ["/tools/a", false],
    ]);
  });

  it("records a registered tool's visits under its ID, and a community tool's clicks apart from them", () => {
    const tools = toolCatalog([manifest("a", "Academics")], [community("a", "Academics")]).flatMap((s) => s.tools);
    expect(tools.map((t) => [t.visitId, isCommunityVisitId(t.visitId)])).toEqual([
      ["community-a", true],
      ["a", false],
    ]);
  });
});

describe("toolInfo", () => {
  it("passes the header's details, and nothing private like notYetMigrated", () => {
    const info = toolInfo([
      manifest("a", "Other", { title: "A", description: "Does A.", contributors: ["Ada"], mentor: "Grace", notYetMigrated: true }),
      manifest("b", "Other", { mentor: "" }),
    ]);
    expect(info["a"]).toEqual({ title: "A", description: "Does A.", contributors: ["Ada"], mentor: "Grace" });
    expect(info["b"]?.mentor).toBeNull();
  });
});

describe("fullWidthToolIds", () => {
  it("lists only the tools whose manifest sets fullWidth", () => {
    expect(
      fullWidthToolIds([
        manifest("chat", "Platform", { fullWidth: true }),
        manifest("column", "Other"),
        manifest("explicit", "Other", { fullWidth: false }),
        manifest("canvas", "Other", { fullWidth: true }),
      ]),
    ).toEqual(["chat", "canvas"]);
  });
});
