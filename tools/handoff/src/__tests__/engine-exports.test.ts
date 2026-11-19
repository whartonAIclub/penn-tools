// The engine module's contract (C-DESIGN.md §2.2 and §9.1):
// - index.d.ts, preview.d.ts and time.d.ts type-check under the package's strict settings with skipLibCheck off
//   (pnpm typecheck skips errors inside .d.ts files, where a mistyped name would silently become `any`);
// - every name they declare exists at runtime with the declared kind, and every runtime export is declared;
// - index.js never imports preview.js, and server code (src/ outside __tests__) never imports the preview module;
// - the engine has no "use client" directive and no window, document or localStorage outside a typeof guard;
// - no time-zone-dependent date code in engine/ or src/: every naive date and time is New York wall time (time.js, §5.2).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as engine from "../../engine/index.js";
import * as previewModule from "../../engine/preview.js";
import * as timeModule from "../../engine/time.js";

const TOOL = fileURLToPath(new URL("../../", import.meta.url));
const ENGINE_DIR = join(TOOL, "engine");
const SRC_DIR = join(TOOL, "src");
const rel = (file: string): string => relative(TOOL, file).split(sep).join("/");

function filesUnder(dir: string, keep: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) out.push(...filesUnder(file, keep));
    else if (keep(file)) out.push(file);
  }
  return out.sort();
}
const engineFiles = (): string[] => filesUnder(ENGINE_DIR, (f) => f.endsWith(".js"));
/** Server code: src/ without the tests. */
const serverFiles = (): string[] => filesUnder(SRC_DIR, (f) => /\.(ts|mts|js|mjs)$/.test(f) && !rel(f).startsWith("src/__tests__/"));
const parse = (file: string): ts.SourceFile => ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true, file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}
const formatDiagnostic = (d: ts.Diagnostic): string => {
  const where = d.file && d.start !== undefined ? `${rel(d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1} ` : "";
  return `${where}TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
};

/** The package's compiler options (tsconfig.json, extending the repo's base), with skipLibCheck off. */
function packageOptions(): ts.CompilerOptions {
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(formatDiagnostic(d)); },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(join(TOOL, "tsconfig.json"), { skipLibCheck: false, noEmit: true }, host);
  if (!parsed) throw new Error("tsconfig.json could not be read");
  return { ...parsed.options, types: [] };
}

type Kind = "function" | "number" | "string" | "boolean" | "object";
/** Each value a .d.ts exports (re-exports followed to their declarations), with the runtime typeof its declared type implies. */
function declaredValues(program: ts.Program, file: string): Map<string, Kind> {
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(file);
  if (!sf) throw new Error(`${file} is not in the program`);
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) throw new Error(`${file} is not a module`);
  const out = new Map<string, Kind>();
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    if (!(symbol.flags & ts.SymbolFlags.Value)) continue;
    const type = checker.getTypeOfSymbolAtLocation(symbol, sf);
    const kind: Kind = type.getCallSignatures().length > 0 ? "function"
      : type.flags & ts.TypeFlags.NumberLike ? "number"
      : type.flags & ts.TypeFlags.StringLike ? "string"
      : type.flags & ts.TypeFlags.BooleanLike ? "boolean"
      : "object";
    out.set(exported.name, kind);
  }
  return out;
}
function runtimeValues(namespace: object): Map<string, string> {
  return new Map(Object.keys(namespace).sort().map((k) => [k, typeof (namespace as Record<string, unknown>)[k]]));
}

describe("the engine's hand-written declarations", () => {
  const declarationFiles = [join(ENGINE_DIR, "index.d.ts"), join(ENGINE_DIR, "preview.d.ts"), join(ENGINE_DIR, "time.d.ts")];
  const program = ts.createProgram({ rootNames: declarationFiles, options: packageOptions() });

  it("type-check strictly, with skipLibCheck off", () => {
    expect(ts.getPreEmitDiagnostics(program).map(formatDiagnostic)).toEqual([]);
  });

  it.each([
    ["index", join(ENGINE_DIR, "index.d.ts"), engine],
    ["preview", join(ENGINE_DIR, "preview.d.ts"), previewModule],
    ["time", join(ENGINE_DIR, "time.d.ts"), timeModule],
  ] as const)("declare exactly what %s.js exports, each with the right kind", (_label, dts, namespace) => {
    const declared = declaredValues(program, dts);
    const runtime = runtimeValues(namespace);
    expect([...declared.keys()].sort()).toEqual([...runtime.keys()]);
    const wrongKind = [...declared].filter(([name, kind]) => runtime.get(name) !== kind).map(([name, kind]) => `${name}: declared ${kind}, runtime ${runtime.get(name)}`);
    expect(wrongKind).toEqual([]);
  });

  it("cover the module's whole surface (a sanity check on the comparison above)", () => {
    expect(runtimeValues(engine).size).toBeGreaterThan(150);
    expect([...runtimeValues(previewModule).keys()]).toEqual(["SEED_IDS", "runSelfTests", "seed"]);
    expect([...runtimeValues(timeModule).keys()]).toEqual(["NY_TZ", "nyIsoDate", "nyParts", "wallToMs"]);
    expect(runtimeValues(engine).get("CLOCK")).toBe("number");
    // index.js re-exports time.js, and both name the same functions.
    expect(engine.wallToMs).toBe(timeModule.wallToMs);
    expect(engine.NY_TZ).toBe("America/New_York");
  });
});

describe("what imports what", () => {
  const imports = (file: string): string[] => ts.preProcessFile(readFileSync(file, "utf8"), true, true).importedFiles.map((f) => f.fileName);
  const PREVIEW = /(^|\/)engine\/preview(\.js)?$|^\.\/preview(\.js)?$|^@penntools\/tool-handoff\/preview$/;

  it("index.js never imports the preview module (it would load the seed and close a cycle)", () => {
    expect(imports(join(ENGINE_DIR, "index.js")).filter((s) => PREVIEW.test(s))).toEqual([]);
  });

  it("time.js imports nothing", () => {
    expect(imports(join(ENGINE_DIR, "time.js"))).toEqual([]);
  });

  it("server code (src/ outside __tests__) never imports the preview module", () => {
    const offenders = serverFiles().flatMap((f) => imports(f).filter((s) => PREVIEW.test(s)).map((s) => `${rel(f)} imports ${s}`));
    expect(serverFiles().length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

describe("the engine runs on the server too", () => {
  const BROWSER_GLOBALS = new Set(["window", "document", "localStorage"]);
  /** An identifier used as a value, not a property name or declaration name. */
  const isReference = (id: ts.Identifier): boolean => {
    const p = id.parent;
    if ((ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === id) return false;
    if (ts.isBindingElement(p) && p.propertyName === id) return false;
    return true;
  };
  /** Inside `typeof x`, or in the branch a `typeof x` test guards (if, ?:, &&). */
  const isGuarded = (id: ts.Identifier): boolean => {
    if (ts.isTypeOfExpression(id.parent)) return true;
    const guard = new RegExp(`typeof\\s+${id.text}\\b`);
    for (let child: ts.Node = id, n: ts.Node = id.parent; !ts.isSourceFile(n); child = n, n = n.parent) {
      if (ts.isIfStatement(n) && n.thenStatement === child && guard.test(n.expression.getText())) return true;
      if (ts.isConditionalExpression(n) && n.whenTrue === child && guard.test(n.condition.getText())) return true;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && n.right === child && guard.test(n.left.getText())) return true;
    }
    return false;
  };

  it('has no "use client" directive', () => {
    const directives = engineFiles().flatMap((f) => {
      const out: string[] = [];
      for (const st of parse(f).statements) {
        if (!(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression))) break; // the prologue ends here
        out.push(`${rel(f)}: "${st.expression.text}"`);
      }
      return out;
    });
    expect(directives.filter((d) => d.endsWith('"use client"'))).toEqual([]);
  });

  it("uses window, document and localStorage only behind a typeof guard", () => {
    const unguarded: string[] = [];
    for (const f of engineFiles()) {
      const sf = parse(f);
      walk(sf, (n) => {
        if (ts.isIdentifier(n) && BROWSER_GLOBALS.has(n.text) && isReference(n) && !isGuarded(n)) {
          unguarded.push(`${rel(f)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${n.text}`);
        }
      });
    }
    expect(engineFiles().length).toBeGreaterThanOrEqual(3);
    expect(unguarded).toEqual([]);
  });
});

describe("dates and time zones (C-DESIGN.md section 5.2)", () => {
  /**
   * Time-zone-independent code everywhere: C3 rewrote the engine's date code with time.js's New York helpers (the C2 list of
   * functions still to do is gone). The only allowed match is money's number formatting.
   */
  const NOT_DATES: Record<string, number> = {
    "engine/index.js money format-without-zone": 2, // Number#toLocaleString: amounts, not times, so no zone applies
  };
  const LOCAL_TIME_METHODS = /^(get|set)(FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)$|^getTimezoneOffset$|^getYear$/;
  const hasStringLiteral = (node: ts.Node): boolean => {
    let found = false;
    walk(node, (n) => { if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) found = true; });
    return found;
  };
  const hasTimeZoneOption = (args: readonly ts.Expression[]): boolean =>
    args.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) => p.name !== undefined && p.name.getText() === "timeZone"));
  function declarationName(sf: ts.SourceFile, node: ts.Node): string {
    let n = node;
    while (n.parent && n.parent !== sf) n = n.parent;
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (ts.isVariableStatement(n)) return n.declarationList.declarations.map((d) => d.name.getText(sf)).join(",");
    if (ts.isClassDeclaration(n) && n.name) return n.name.text;
    return "(top level)";
  }
  /** naive-parse: new Date("…") or Date.parse; local-constructor: new Date(y, m, …); format-without-zone: toLocale*String
   * with no timeZone option; local-format: toTimeString or toDateString (always the machine's zone); local-getter: getHours()
   * and the other local-time getters and setters. */
  function scan(files: readonly string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const f of files) {
      const sf = parse(f);
      walk(sf, (n) => {
        let kind: string | null = null;
        if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Date") {
          const args = n.arguments ?? ts.factory.createNodeArray<ts.Expression>();
          const first = args[0];
          if (args.length === 1 && first !== undefined && hasStringLiteral(first)) kind = "naive-parse";
          else if (args.length >= 2) kind = "local-constructor";
        } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
          const method = n.expression.name.text;
          if (method === "parse" && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "Date") kind = "naive-parse";
          else if (/^toLocale(Date|Time)?String$/.test(method) && !hasTimeZoneOption(n.arguments)) kind = "format-without-zone";
          else if (method === "toTimeString" || method === "toDateString") kind = "local-format";
          else if (LOCAL_TIME_METHODS.test(method)) kind = "local-getter";
        }
        if (kind) {
          const key = `${rel(f)} ${declarationName(sf, n)} ${kind}`;
          counts[key] = (counts[key] ?? 0) + 1;
        }
      });
    }
    return counts;
  }

  it("the engine and server code have no time-zone-dependent date code", () => {
    expect(scan([...engineFiles(), ...serverFiles()])).toEqual(NOT_DATES);
  });

  it("the scan finds each kind it looks for (a check on the scan itself)", () => {
    const probe = join(TOOL, "src", "__tests__", "fixtures", "time-scan-probe.js");
    expect(scan([probe])).toEqual({
      "src/__tests__/fixtures/time-scan-probe.js parsed naive-parse": 2,
      "src/__tests__/fixtures/time-scan-probe.js built local-constructor": 1,
      "src/__tests__/fixtures/time-scan-probe.js shown format-without-zone": 2,
      "src/__tests__/fixtures/time-scan-probe.js local local-format": 2,
      "src/__tests__/fixtures/time-scan-probe.js hour local-getter": 1,
    });
  });
});
