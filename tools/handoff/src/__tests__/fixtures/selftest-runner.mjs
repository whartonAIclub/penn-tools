// Runs Handoff's rule self-tests in this process's time zone and prints one JSON line.
// engine-selftests.test.ts starts it with TZ set to each zone it checks; Node reads TZ at startup.
import { runSelfTests, seed } from "../../../engine/preview.js";

const results = runSelfTests(seed());
process.stdout.write(JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, results }) + "\n");
