"use client";

// The ⓘ next to a trip's price, showing what the price includes. It opens on
// hover, on keyboard focus and on tap (phones have no hover), and Esc or a tap
// elsewhere closes it. The popup spans the price row, which is positioned in
// TripCatalog.module.css, so it never runs off the card's edge.

import { useEffect, useId, useRef, useState } from "react";
import styles from "./TripCatalog.module.css";

export function PriceInfo({ text }: { text: string }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);
  const popupId = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const open = hovered || focused || tapped;

  useEffect(() => {
    if (!open) return;
    function close() {
      setHovered(false);
      setFocused(false);
      setTapped(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <span ref={ref} className={styles.info} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        type="button"
        className={styles.infoButton}
        aria-label="What the price includes"
        aria-expanded={open}
        aria-describedby={open ? popupId : undefined}
        onClick={() => setTapped(!tapped)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        ⓘ
      </button>
      {open && (
        <span id={popupId} role="tooltip" className={styles.infoPopup}>
          {text}
        </span>
      )}
    </span>
  );
}
