// Hand-written types for engine/preview.js (development and test fixtures only).
// Every runtime export is declared here; src/__tests__/engine-exports.test.ts checks both directions.
import type { WorldState } from "./index.js";

/** One rule self-test: pass is true only when the check returned true; detail says what went wrong. */
export interface SelfTestResult { name: string; pass: boolean; detail: string }

/** A fresh copy of the sample data: fictional people, holdings, listings, requests, goods and notifications. */
export declare function seed(): WorldState;
/** The ids of the seeded listings, interests, goods and requests (every copy of the preview has them). */
export declare const SEED_IDS: ReadonlySet<string>;
/**
 * Runs every rule check against fresh seeds. It never changes the state passed in, and re-applies that state's
 * clock and policies when it finishes (none: the defaults).
 */
export declare function runSelfTests(appState?: WorldState | null): SelfTestResult[];
