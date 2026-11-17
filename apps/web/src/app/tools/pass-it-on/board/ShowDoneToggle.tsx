"use client";

// The "Show done" box in the filter form. Done tasks default to shown when one
// event is picked and hidden for All events, so the form sends `done` only when
// the box differs from that default (a real override). The box follows the form's
// event select until the user touches it. Without JS the box is inert and the
// server's default for a missing `done` still applies.

import { useEffect, useRef, useState } from "react";

const isOneEvent = (value: string) => value !== "" && value !== "ongoing";

export function ShowDoneToggle({ initialEvent, initialChecked, label }: { initialEvent: string; initialChecked: boolean; label: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [event, setEvent] = useState(initialEvent);
  const [checked, setChecked] = useState(initialChecked);
  const touched = useRef(false);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const target = e.target;
      if (target instanceof HTMLSelectElement && target.name === "event") {
        setEvent(target.value);
        if (!touched.current) setChecked(isOneEvent(target.value));
      }
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);

  const isOverride = checked !== isOneEvent(event);
  return (
    <span ref={anchor}>
      {isOverride && <input type="hidden" name="done" value={checked ? "1" : "0"} />}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          touched.current = true;
          setChecked(e.target.checked);
        }}
      />{" "}
      {label}
    </span>
  );
}
