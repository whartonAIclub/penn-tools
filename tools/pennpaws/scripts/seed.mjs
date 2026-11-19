// Fake Penn students for testing PennPaws locally (see src/testPeople.ts).
// Under `pnpm dev` the same actions are in the Test menu at the bottom of the
// page, so this script is for setting up from the terminal.
//
//   pnpm --filter @penntools/tool-pennpaws seed          add them (replacing any earlier ones)
//   pnpm --filter @penntools/tool-pennpaws seed play     have them take their next step
//   pnpm --filter @penntools/tool-pennpaws seed reset    remove them

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { playTestPeople, removeTestPeople, seedTestPeople } from "../dist/index.js";

const envFile = fileURLToPath(new URL("../../../apps/web/.env.local", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL, or create apps/web/.env.local (see the README).");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { connection: { search_path: "pennpaws" }, onnotice: () => {} });

const commands = {
  async seed() {
    const { sitters, owners } = await seedTestPeople(sql);
    console.log(`Added ${sitters} fake sitters and ${owners} fake owners with open requests.`);
  },
  async play() {
    const done = await playTestPeople(sql);
    console.log(done.length ? done.join("\n") : "Nothing for the fake people to do yet. Take your next step, then run this again.");
  },
  async reset() {
    await removeTestPeople(sql);
    console.log("Removed the fake people and their requests.");
  },
};

const command = process.argv[2] ?? "seed";
if (!commands[command]) {
  console.error(`Unknown command "${command}". Use seed, play or reset.`);
  process.exit(1);
}
try {
  await commands[command]();
} finally {
  await sql.end();
}
