"use client";

// A microphone button for voice typing into a text box, with the browser's own
// speech recognition (Chrome, Edge and Safari have it; Firefox doesn't). Where
// it's missing, the button explains the system's dictation instead. Chrome
// sends the audio to Google and Safari to Apple to transcribe; PennTools never
// receives it, only the words that land in the box.

import { useEffect, useRef, useState } from "react";
import styles from "./RecruitingHelper.module.css";

// The part of the Web Speech API used here; TypeScript's DOM types don't include it.
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Allow microphone access for this site in your browser, then try again.",
  "service-not-allowed": "Voice typing is turned off in this browser. Try Chrome or Safari, or your computer's dictation.",
  "audio-capture": "No microphone was found.",
  network: "Voice typing needs an internet connection.",
};

/** Speaks into a text box: each finished phrase is passed to `onText` to append. */
export function Dictation({ onText, label }: { onText: (text: string) => void; label: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  // The latest onText, so a phrase finished after a re-render goes to the current text.
  const latestOnText = useRef(onText);
  latestOnText.current = onText;

  // Whether the browser has speech recognition is only known in the browser.
  useEffect(() => setSupported(recognitionConstructor() !== null), []);
  useEffect(() => () => recognition.current?.stop(), []);

  function start() {
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    const r = new Constructor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        if (result.isFinal) latestOnText.current(result[0].transcript.trim());
        else pending += result[0].transcript;
      }
      setInterim(pending);
    };
    r.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setMessage(ERRORS[event.error] ?? "Voice typing stopped. Try again.");
      }
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognition.current = r;
    setMessage(null);
    setListening(true);
    r.start();
  }

  function toggle() {
    if (supported === false) {
      setMessage((old) =>
        old ? null : "This browser can't do voice typing. On a Mac, click in the box and press 🌐 (fn) twice to dictate; on a phone, tap the keyboard's microphone. Or open this page in Chrome or Safari.",
      );
      return;
    }
    if (listening) recognition.current?.stop();
    else start();
  }

  if (supported === null) return null;

  return (
    <>
      <button
        type="button"
        className={listening ? `${styles.mic} ${styles.micOn}` : styles.mic}
        onClick={toggle}
        aria-label={listening ? "Stop voice typing" : label}
        aria-pressed={listening}
        title={listening ? "Stop voice typing" : label}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.07A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0Z"
          />
        </svg>
      </button>
      {(listening || message) && (
        <span className={styles.micStatus} role="status">
          {listening ? `Listening… ${interim}` : message}
        </span>
      )}
    </>
  );
}
