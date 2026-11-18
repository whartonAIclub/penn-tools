"use client";

// Step 2: the student's week, on a calendar grid. Fill it by importing a
// calendar file (.ics, read in the browser at no cost), from a screenshot, or
// by dragging on the grid. Also asks where they live.

import { useEffect, useRef, useState } from "react";
import {
  MAX_ICS_LENGTH,
  readIcs,
  SAMPLE_SCHEDULE,
  weekStart,
  type PlannerProfile,
  type WeeklySchedule,
} from "@penntools/tool-penn-fitness";
import { WeekGrid } from "./WeekGrid";
import sampleScreenshot from "./sample-schedule.svg";
import styles from "../Nutrition.module.css";

function shortDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ScheduleStep({
  initial,
  profile,
  submitLabel,
  onBack,
  onNext,
}: {
  initial: WeeklySchedule;
  profile: PlannerProfile;
  /** The save button's label; by default it's the wizard's "Next". */
  submitLabel?: string;
  onBack: () => void;
  onNext: (schedule: WeeklySchedule, home: string | null) => void;
}) {
  const [blocks, setBlocks] = useState(initial);
  const [home, setHome] = useState(profile.home ?? "");
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"screenshot" | "calendar" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const places = [
    ...new Set([...(home.trim() ? [home.trim()] : []), ...blocks.flatMap((b) => (b.location ? [b.location] : []))]),
  ];

  function replaceWith(next: WeeklySchedule, from: string) {
    if (blocks.length > 0 && !window.confirm(`Replace the ${blocks.length} items on your week with ${next.length} from ${from}?`)) return;
    setBlocks(next);
    setError(null);
    setMessage(`Added ${next.length} ${next.length === 1 ? "item" : "items"} from ${from}. Check them on the grid; delete anything that doesn't repeat each week.`);
  }

  async function importFile(file: File) {
    setError(null);
    setMessage(null);
    if (file.size > MAX_ICS_LENGTH) {
      setError("That file is too big. Export just your main calendar.");
      return;
    }
    try {
      const next = readIcs(await file.text(), week);
      if (next.length === 0) setError(`No timed events in the week of ${shortDate(week)}. Try another week.`);
      else replaceWith(next, `your calendar (week of ${shortDate(week)})`);
    } catch {
      setError("Couldn't read that file. Make sure it's a calendar export ending in .ics.");
    }
  }

  function shiftWeek(weeks: number) {
    const next = new Date(week);
    next.setDate(next.getDate() + weeks * 7);
    setWeek(next);
  }

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        Where do you live? <span className={styles.hint}>(where you&apos;d cook)</span>
        <input className={styles.input} value={home} maxLength={120} placeholder="e.g. 2040 Market St" onChange={(e) => setHome(e.target.value)} />
      </label>

      <div className={styles.subsection}>
        <h3 className={styles.subTitle}>Fill your week</h3>
        <div className={styles.controls}>
          <button className={source === "screenshot" ? styles.button : styles.secondaryButton} onClick={() => setSource(source === "screenshot" ? null : "screenshot")}>
            From a screenshot
          </button>
          <button className={source === "calendar" ? styles.button : styles.secondaryButton} onClick={() => setSource(source === "calendar" ? null : "calendar")}>
            From a calendar file (.ics)
          </button>
        </div>

        {source === "screenshot" && <ScreenshotSchedule onRead={(next) => replaceWith(next, "the screenshot")} onError={setError} />}

        {source === "calendar" && (
          <>
            <div className={styles.controls}>
              <span className={styles.weekPicker}>
                <button aria-label="Previous week" onClick={() => shiftWeek(-1)}>
                  ‹
                </button>
                Week of {shortDate(week)}
                <button aria-label="Next week" onClick={() => shiftWeek(1)}>
                  ›
                </button>
              </span>
              <button className={styles.secondaryButton} onClick={() => fileInput.current?.click()}>
                Choose .ics file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".ics,text/calendar"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            <details className={styles.meta}>
              <summary>How to get an .ics file from Google Calendar</summary>
              <ol className={styles.foods}>
                <li>Open Google Calendar on a computer and click the gear icon → Settings.</li>
                <li>
                  Under &quot;Settings for my calendars&quot;, pick your calendar, then <strong>Export calendar</strong>.
                  (Or &quot;Import &amp; export&quot; → Export, which downloads a .zip with one .ics per calendar.)
                </li>
                <li>Choose the week above, then the .ics file. Outlook and Apple Calendar exports work too.</li>
                <li>Added something new later? Import again, or drag it onto the grid.</li>
              </ol>
            </details>
          </>
        )}

        {message && <p className={styles.notice}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <p className={styles.meta}>
        Drag down a day to add a class or commitment; click one to edit it or add where it is. Grey hours are when
        you&apos;re asleep.
      </p>
      <WeekGrid blocks={blocks} wakeTime={profile.wakeTime} sleepTime={profile.sleepTime} places={places} onChange={setBlocks} />

      <div className={styles.controls}>
        <button className={styles.secondaryButton} onClick={onBack}>
          Back
        </button>
        <button className={styles.button} onClick={() => onNext(blocks, home.trim() || null)}>
          {submitLabel ?? (blocks.length ? "Next: how you eat" : "Skip: I have no fixed schedule")}
        </button>
      </div>
    </div>
  );
}

/**
 * A screenshot of the student's calendar, read into blocks with locations.
 * Only the sample can be read for now: the platform's AI API takes text only,
 * so reading the student's own image waits on image support from the Platform
 * team. Images stay in the browser; nothing is uploaded.
 */
function ScreenshotSchedule({
  onRead,
  onError,
}: {
  onRead: (blocks: WeeklySchedule) => void;
  onError: (message: string | null) => void;
}) {
  const [image, setImage] = useState<{ url: string; sample: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Free the browser's copy of an uploaded image when it's replaced or the step closes.
  useEffect(() => {
    return () => {
      if (image && !image.sample) URL.revokeObjectURL(image.url);
    };
  }, [image]);

  function read() {
    if (image?.sample) onRead(SAMPLE_SCHEDULE);
    else
      onError(
        "Reading your own screenshots needs image support in PennTools' AI, which isn't available yet. For now, import a calendar file or drag on the grid. Try the sample to see how it will work.",
      );
  }

  return (
    <div className={styles.form}>
      <div className={styles.controls}>
        <button className={styles.secondaryButton} onClick={() => fileInput.current?.click()}>
          Upload screenshot
        </button>
        <button className={styles.secondaryButton} onClick={() => setImage({ url: sampleScreenshot.src, sample: true })}>
          Use sample screenshot
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setImage({ url: URL.createObjectURL(file), sample: false });
            onError(null);
            e.target.value = "";
          }}
        />
      </div>
      <p className={styles.meta}>A screenshot of your week view works best, with each class&apos;s location in its title or details.</p>
      {image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a page image */}
          <img className={styles.screenshot} src={image.url} alt={image.sample ? "Sample calendar screenshot" : "Your calendar screenshot"} />
          <div className={styles.controls}>
            <button className={styles.button} onClick={read}>
              Read into my week
            </button>
          </div>
        </>
      )}
    </div>
  );
}
