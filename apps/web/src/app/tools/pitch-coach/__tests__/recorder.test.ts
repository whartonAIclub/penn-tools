// Tests for PitchCoach's recorder with a fake speech recognizer: restarting
// when the browser ends a session, keeping the transcript across sessions,
// and stopping on errors. A real microphone has to be checked by hand.

import { describe, it, expect, beforeEach } from "vitest";
import {
  MAX_QUICK_ENDS,
  QUICK_END_MS,
  startRecorder,
  type SpeechRecognitionErrorEvent,
  type SpeechRecognitionInstance,
  type SpeechRecognitionResultEvent,
} from "../recorder";

/** A recognizer the test drives: it counts starts and aborts and fires events on request. */
class FakeRecognition implements SpeechRecognitionInstance {
  static last: FakeRecognition;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  starts = 0;
  aborts = 0;
  /** Makes start() throw, as a browser does when recognition can't start. */
  static failStart = false;

  constructor() {
    FakeRecognition.last = this;
  }

  start() {
    if (FakeRecognition.failStart) throw new Error("InvalidStateError");
    this.starts++;
  }

  abort() {
    this.aborts++;
  }

  /** One session's results so far: [text, isFinal] pairs, as the browser lists them. */
  results(...results: [string, boolean][]) {
    const list = Object.assign(
      results.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
      { length: results.length },
    );
    this.onresult?.({ resultIndex: 0, results: list } as unknown as SpeechRecognitionResultEvent);
  }

  error(error: string) {
    this.onerror?.({ error });
  }

  end() {
    this.onend?.();
  }
}

let clock = 0;
const now = () => clock;
let transcripts: string[];
let failures: [string, boolean][];

function start() {
  return startRecorder(
    FakeRecognition,
    {
      onTranscript: (text) => transcripts.push(text),
      onFailure: (message, microphone) => failures.push([message, microphone]),
    },
    now,
  );
}

beforeEach(() => {
  clock = 0;
  transcripts = [];
  failures = [];
});

describe("startRecorder", () => {
  it("listens continuously in US English with interim results", () => {
    start();
    const r = FakeRecognition.last;
    expect(r).toMatchObject({ continuous: true, interimResults: true, lang: "en-US", starts: 1 });
  });

  it("reports final and interim words together", () => {
    const recorder = start();
    FakeRecognition.last.results(["I led a team", true], ["of five", false]);
    expect(recorder.transcript).toBe("I led a team of five");
    expect(transcripts).toEqual(["I led a team of five"]);
  });

  it("starts a new session when the browser ends one, keeping what was heard", () => {
    const recorder = start();
    const r = FakeRecognition.last;
    r.results(["I led a team", true], ["of five", false]);
    clock += 10_000;
    r.end();
    expect(r.starts).toBe(2);

    // The new session's results start over, without the earlier words.
    r.results(["engineers", true]);
    expect(recorder.transcript).toBe("I led a team of five engineers ");
  });

  it("gives up when sessions keep ending as soon as they start", () => {
    start();
    const r = FakeRecognition.last;
    for (let i = 0; i < MAX_QUICK_ENDS; i++) {
      clock += QUICK_END_MS - 1;
      r.end();
    }
    expect(r.starts).toBe(MAX_QUICK_ENDS);
    expect(failures).toEqual([[expect.stringMatching(/keeps stopping/), false]]);
    expect(r.aborts).toBe(1);
  });

  it("keeps going through silence", () => {
    start();
    const r = FakeRecognition.last;
    r.error("no-speech");
    clock += 8000;
    r.end();
    expect(failures).toEqual([]);
    expect(r.starts).toBe(2);
  });

  it("stops for good when the microphone is blocked or missing", () => {
    start();
    const blocked = FakeRecognition.last;
    blocked.error("not-allowed");
    clock += 10_000;
    blocked.end(); // the browser ends the session after the error
    expect(failures).toEqual([[expect.stringMatching(/microphone access/), true]]);
    expect(blocked.starts).toBe(1);

    start();
    FakeRecognition.last.error("audio-capture");
    expect(failures[1]).toEqual([expect.stringMatching(/No microphone/), true]);
  });

  it("keeps the transcript when a network error stops it", () => {
    const recorder = start();
    const r = FakeRecognition.last;
    r.results(["I led a team", true]);
    r.error("network");
    r.end(); // the browser ends the session after an error
    expect(failures).toEqual([[expect.stringMatching(/internet connection/), false]]);
    expect(recorder.transcript).toBe("I led a team ");
    expect(r.starts).toBe(1);
  });

  it("reports a recognizer that won't start", () => {
    FakeRecognition.failStart = true;
    try {
      start();
    } finally {
      FakeRecognition.failStart = false;
    }
    expect(failures).toEqual([[expect.stringMatching(/couldn't start/), false]]);
  });

  it("stops without restarting or reporting anything more", () => {
    const recorder = start();
    const r = FakeRecognition.last;
    r.results(["Hello there", false]);
    recorder.stop();
    recorder.stop();
    expect(r.aborts).toBe(1);
    expect(r.onresult).toBeNull();
    expect(r.onend).toBeNull();
    expect(recorder.transcript).toBe("Hello there");
  });
});
