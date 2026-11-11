// Tests for new-tool.mjs: runs it in a temporary repo with a minimal web app.
// Run: node --test "scripts/*.test.mjs"

import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "new-tool.mjs");

const CONTAINER = `import { toolRegistry } from "@penntools/core/tools";
import { AskPennTool } from "@penntools/tool-askpenn";
toolRegistry.register(new AskPennTool());
// ── Repositories ──
`;

// The script reads the categories from TOOL_CATEGORIES in core's Tool.ts.
const TOOL_TS = `export const TOOL_CATEGORIES = [
  "Recruiting",
  "Academics",
  "Other",
] as const;
`;

/** A temporary repo with the script, core's Tool.ts, apps/web/package.json and container.ts, deleted after the test. */
function repo(t, container = CONTAINER) {
  const root = mkdtempSync(join(tmpdir(), "new-tool-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, contents) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  };
  mkdirSync(join(root, "scripts"));
  copyFileSync(script, join(root, "scripts", "new-tool.mjs"));
  write(
    "apps/web/package.json",
    JSON.stringify({ name: "@penntools/web", dependencies: { "@penntools/core": "workspace:*", next: "14" } }, null, 2) + "\n",
  );
  write("apps/web/src/lib/container.ts", container);
  write("packages/core/src/tools/Tool.ts", TOOL_TS);
  return {
    root,
    read: (path) => readFileSync(join(root, path), "utf8"),
    exists: (path) => existsSync(join(root, path)),
    run: (...args) => spawnSync(process.execPath, [join(root, "scripts", "new-tool.mjs"), ...args], { encoding: "utf8" }),
  };
}

const ARGS = [
  "--id", "course-finder",
  "--title", "Course Finder",
  "--description", "Find courses.",
  "--contributors", "Ada, Bob",
  "--category", "Academics",
  "--yes",
];

test("creates the tool package and page, and registers the tool", (t) => {
  const r = repo(t);
  const result = r.run(...ARGS, "--mentor", "Grace");
  assert.equal(result.status, 0, result.stderr);

  const tool = r.read("tools/course-finder/src/CourseFinderTool.ts");
  assert.match(tool, /export class CourseFinderTool extends Tool/);
  assert.match(tool, /id: "course-finder",/);
  assert.match(tool, /contributors: \["Ada", "Bob"\],/);
  assert.match(tool, /mentor: "Grace",/);
  // New tools start in the category they name, in beta, and on the AI API.
  assert.match(tool, /category: "Academics",/);
  assert.match(tool, /beta: true,/);
  assert.doesNotMatch(tool, /notYetMigrated/);
  assert.equal(r.read("tools/course-finder/src/index.ts"), 'export { CourseFinderTool } from "./CourseFinderTool.js";\n');
  assert.equal(JSON.parse(r.read("tools/course-finder/package.json")).name, "@penntools/tool-course-finder");
  assert.ok(r.exists("tools/course-finder/tsconfig.json"));
  assert.match(r.read("apps/web/src/app/tools/course-finder/page.tsx"), /export default function CourseFinderPage/);

  const deps = JSON.parse(r.read("apps/web/package.json")).dependencies;
  assert.deepEqual(Object.entries(deps), [
    ["@penntools/core", "workspace:*"],
    ["@penntools/tool-course-finder", "workspace:*"], // in alphabetical order
    ["next", "14"],
  ]);
  assert.equal(
    r.read("apps/web/src/lib/container.ts"),
    CONTAINER.replace(
      "toolRegistry.register(new AskPennTool());\n",
      'toolRegistry.register(new AskPennTool());\nimport { CourseFinderTool } from "@penntools/tool-course-finder";\ntoolRegistry.register(new CourseFinderTool());\n',
    ),
  );
});

test("leaves the mentor out when none is given", (t) => {
  const r = repo(t);
  assert.equal(r.run(...ARGS).status, 0);
  assert.doesNotMatch(r.read("tools/course-finder/src/CourseFinderTool.ts"), /mentor/);
});

test("quotes titles and descriptions safely", (t) => {
  const r = repo(t);
  const args = [...ARGS];
  args[3] = 'Penn\'s "Best" Tool';
  args[5] = "Uses `backticks` and ${braces}.";
  assert.equal(r.run(...args).status, 0);
  const tool = r.read("tools/course-finder/src/CourseFinderTool.ts");
  assert.match(tool, /title: "Penn's \\"Best\\" Tool",/);
  assert.match(tool, /description: "Uses `backticks` and \$\{braces\}\.",/);
});

test("takes a category in any case, writing it as TOOL_CATEGORIES spells it", (t) => {
  const r = repo(t);
  const args = [...ARGS];
  args[9] = "academics";
  assert.equal(r.run(...args).status, 0);
  assert.match(r.read("tools/course-finder/src/CourseFinderTool.ts"), /category: "Academics",/);
});

test("rejects a category that isn't in TOOL_CATEGORIES, pointing to the Platform team", (t) => {
  const r = repo(t);
  const args = [...ARGS];
  args[9] = "Gaming";
  const result = r.run(...args);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /"Gaming" isn't a category\. Pick one of: Recruiting, Academics, Other\./);
  assert.match(result.stderr, /ask the Platform team/);
  assert.ok(!r.exists("tools"));
});

test("writes nothing when it can't read TOOL_CATEGORIES", (t) => {
  const r = repo(t);
  writeFileSync(join(r.root, "packages/core/src/tools/Tool.ts"), "// no categories\n");
  const result = r.run(...ARGS);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TOOL_CATEGORIES/);
  assert.ok(!r.exists("tools"));
});

for (const [label, id] of [
  ["a numeric ID", "42"],
  ["capitals", "CourseFinder"],
  ["underscores", "course_finder"],
  ["a trailing hyphen", "course-"],
]) {
  test(`rejects ${label}, writing nothing`, (t) => {
    const r = repo(t);
    const args = [...ARGS];
    args[1] = id;
    const result = r.run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Tool ID/);
    assert.ok(!r.exists("tools"));
  });
}

test("rejects an ID that's already taken", (t) => {
  const r = repo(t);
  mkdirSync(join(r.root, "tools", "course-finder"), { recursive: true });
  const result = r.run(...ARGS);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already exists/);
});

test("rejects a retired ID that next.config.mjs redirects, and only that one", (t) => {
  const redirects = (source) =>
    `export default { async redirects() { return [{ source: "${source}", destination: "/tools/other", permanent: true }]; } };\n`;
  for (const source of ["/tools/course-finder", "/tools/course-finder/:path*"]) {
    const r = repo(t);
    writeFileSync(join(r.root, "apps/web/next.config.mjs"), redirects(source));
    const result = r.run(...ARGS);
    assert.equal(result.status, 1, `${source} should block the ID`);
    assert.match(result.stderr, /\/tools\/course-finder redirects elsewhere/);
    assert.equal(r.exists("tools/course-finder"), false);
  }
  // A redirect for a longer ID that starts the same doesn't count.
  const r = repo(t);
  writeFileSync(join(r.root, "apps/web/next.config.mjs"), redirects("/tools/course-finder-old"));
  assert.equal(r.run(...ARGS).status, 0);
});

test("names missing options instead of asking, when not run in a terminal", (t) => {
  const r = repo(t);
  const result = r.run("--id", "course-finder", "--yes");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing --title, --description, --contributors, --category\./);
  assert.match(result.stderr, /pnpm new-tool --id course-finder --title/);
});

test("explains that this terminal can't answer questions", (t) => {
  const r = repo(t);
  const result = r.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing --id, --title, --description, --contributors, --category\. This terminal can't answer questions/);
});

test("rejects an ID whose class name another tool already uses", (t) => {
  const r = repo(t);
  const args = [...ARGS];
  args[1] = "ask-penn"; // AskPennTool, like the registered askpenn
  const result = r.run(...args);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already uses the class name AskPennTool/);
  assert.ok(!r.exists("tools"));
});

test("needs --yes when not run in a terminal", (t) => {
  const r = repo(t);
  const result = r.run(...ARGS.slice(0, -1));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--yes/);
  assert.ok(!r.exists("tools/course-finder"));
});

test("writes nothing when container.ts can't be patched", (t) => {
  const r = repo(t, "// no registrations\n");
  const result = r.run(...ARGS);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /toolRegistry\.register/);
  assert.ok(!r.exists("tools/course-finder"));
  assert.equal(JSON.parse(r.read("apps/web/package.json")).dependencies["@penntools/tool-course-finder"], undefined);
});

test("keeps container.ts's Windows line endings", (t) => {
  const r = repo(t, CONTAINER.replace(/\n/g, "\r\n"));
  assert.equal(r.run(...ARGS).status, 0);
  assert.doesNotMatch(r.read("apps/web/src/lib/container.ts").replace(/\r\n/g, ""), /\n/);
});
