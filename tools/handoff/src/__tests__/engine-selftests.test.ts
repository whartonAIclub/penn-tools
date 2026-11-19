// The prototype's rule self-tests, run from the engine package (engine/preview.js): every check passes in this
// process and in child processes with TZ set to UTC, America/Los_Angeles and America/New_York, with the same
// checks in each zone (C-DESIGN.md §9.1). New engine checks go in other test files, so this count stays the one the
// browser's #selftest page shows.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runSelfTests, seed, type SelfTestResult } from "../../engine/preview.js";

/** The stabilized count (#selftest shows "96 of 96 passed"). Changing it is a deliberate decision, not a fix. */
const EXPECTED = 96;
const ZONES = ["UTC", "America/Los_Angeles", "America/New_York"] as const;
const RUNNER = fileURLToPath(new URL("./fixtures/selftest-runner.mjs", import.meta.url));

interface ZoneRun { tz: string; results: SelfTestResult[] }

/** Runs the self-tests in a fresh Node process whose time zone is tz (Node reads TZ at startup). */
function runIn(tz: string): Promise<ZoneRun> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [RUNNER], { env: { ...process.env, TZ: tz }, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { reject(new Error(`the self-tests in ${tz} exited: ${error.message}\n${stderr}`)); return; }
      const last = stdout.trim().split("\n").pop() ?? "";
      try { resolve(JSON.parse(last) as ZoneRun); }
      catch { reject(new Error(`the self-tests in ${tz} printed no result: ${stdout.slice(0, 500)}\n${stderr}`)); }
    });
  });
}
const failures = (results: SelfTestResult[]): string[] => results.filter((r) => !r.pass).map((r) => `${r.name}: ${r.detail}`);

describe("the rule self-tests (engine/preview.js)", () => {
  it(`pass ${EXPECTED} of ${EXPECTED} in this process`, () => {
    const results = runSelfTests(seed());
    expect(failures(results)).toEqual([]);
    expect(results).toHaveLength(EXPECTED);
  }, 30_000);

  it("pass in UTC, Los Angeles and New York, with the same checks in each zone", async () => {
    const runs = await Promise.all(ZONES.map((tz) => runIn(tz)));
    runs.forEach((run, k) => {
      expect(run.tz).toBe(ZONES[k]); // the child really ran in that zone
      expect(failures(run.results)).toEqual([]);
      expect(run.results).toHaveLength(EXPECTED);
    });
    const names = runs.map((run) => run.results.map((r) => r.name));
    expect(names[1]).toEqual(names[0]);
    expect(names[2]).toEqual(names[0]);
  }, 60_000);
});
