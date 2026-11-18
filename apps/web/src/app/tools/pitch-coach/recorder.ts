// Listening for PitchCoach: the browser's speech recognition, kept running
// until the user stops it, with the transcript so far. No React here, so the
// restart and error handling can be tested with a fake recognizer (see
// __tests__/recorder.test.ts); a real microphone has to be checked by hand.

// ── Web Speech API types (not universally in lib.dom.d.ts) ────────────────────

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { isFinal: boolean; [index: number]: SpeechRecognitionAlternative | undefined };
type SpeechRecognitionResultList = { length: number; [index: number]: SpeechRecognitionResult | undefined };
export type SpeechRecognitionResultEvent = { resultIndex: number; results: SpeechRecognitionResultList };
export type SpeechRecognitionErrorEvent = { error: string };

export interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

/** The browser's speech recognition, or undefined where there's none (Firefox, or on the server). */
export function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
  );
}

// ── Recorder ──────────────────────────────────────────────────────────────────

/** Errors that mean it can't listen at all, with what to tell the user. */
const MICROPHONE_ERRORS: Record<string, string> = {
  "not-allowed": "PitchCoach needs your microphone. Allow microphone access for this site in your browser, then try again.",
  "service-not-allowed": "Your browser's speech recognition is turned off. Turn it on, or try Chrome or Edge.",
  "audio-capture": "No microphone was found. Connect one and try again.",
};

/** Sessions that end this soon after starting count as failing to start. */
export const QUICK_END_MS = 1000;
/** Give up after this many quick ends in a row, rather than restarting forever. */
export const MAX_QUICK_ENDS = 3;

export interface RecorderEvents {
  /** The transcript so far, including words not yet final. */
  onTranscript: (text: string) => void;
  /**
   * Listening stopped by itself. `microphone` is true when it couldn't
   * listen at all (no access or no microphone), so nothing is worth keeping.
   */
  onFailure: (message: string, microphone: boolean) => void;
}

export interface Recorder {
  /** What was heard so far, including words not yet final. */
  readonly transcript: string;
  /** Stops listening, keeping the transcript; no events follow. Safe to call again. */
  stop: () => void;
}

/** Starts listening in US English until stop() is called or listening fails. */
export function startRecorder(
  Recognition: SpeechRecognitionConstructor,
  events: RecorderEvents,
  now: () => number = Date.now,
): Recorder {
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let active = true;
  let finalText = "";
  let transcript = "";
  let sessionStart = 0;
  let quickEnds = 0;

  function stop() {
    if (!active) return;
    active = false;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
  }

  function fail(message: string, microphone: boolean) {
    if (!active) return;
    stop();
    events.onFailure(message, microphone);
  }

  function listen() {
    sessionStart = now();
    try {
      recognition.start();
    } catch {
      fail("Speech recognition couldn't start. Refresh the page and try again.", false);
    }
  }

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const best = result?.[0];
      if (!result || !best) continue;
      if (result.isFinal) finalText += best.transcript + " ";
      else interim += best.transcript;
    }
    transcript = finalText + interim;
    events.onTranscript(transcript);
  };

  recognition.onerror = (event) => {
    // Silence ends the session, which onend handles; aborting is ours.
    if (event.error === "no-speech" || event.error === "aborted") return;
    const microphone = MICROPHONE_ERRORS[event.error];
    if (microphone) fail(microphone, true);
    else if (event.error === "network") {
      fail("Speech recognition needs an internet connection. Reconnect, then get feedback on what was captured or record again.", false);
    } else {
      fail(`Speech recognition stopped (${event.error}). Get feedback on what was captured, or record again.`, false);
    }
  };

  // Browsers end a session after a pause or a time limit, even when it's
  // continuous; start a new one until the user stops.
  recognition.onend = () => {
    quickEnds = now() - sessionStart < QUICK_END_MS ? quickEnds + 1 : 0;
    if (quickEnds >= MAX_QUICK_ENDS) {
      fail("Speech recognition keeps stopping. Check your microphone, then try again.", false);
      return;
    }
    // Keep any words not yet final: the new session won't repeat them.
    finalText = transcript && !transcript.endsWith(" ") ? `${transcript} ` : transcript;
    listen();
  };

  listen();

  return {
    get transcript() {
      return transcript;
    },
    stop,
  };
}
