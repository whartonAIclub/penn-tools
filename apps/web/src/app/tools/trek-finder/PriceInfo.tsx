"use client";

// A trip's price line, shared by the card and the details panel, and the ⓘ
// next to the price showing what it includes. The ⓘ opens on hover, on
// keyboard focus and on tap (phones have no hover), and Esc or a tap elsewhere
// closes it. Its popup spans the price row, which is positioned in
// TripCatalog.module.css, so it never runs off the card's edge.

import { useEffect, useId, useRef, useState } from "react";
import { currentPriceStage, type Trip } from "@penntools/tool-trek-finder";
import styles from "./TripCatalog.module.css";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
// Dates are read as UTC midnight, so the time zone can't shift the day.
const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Today's price, e.g. "$3,300 Early bird, until Nov 30 ⓘ". The stage only
 * shows when a trip's price changes, and "until" only when the stage ends on a
 * set date. No price shows as TBD.
 */
export function PriceLine({ trip, today }: { trip: Trip; today: string }) {
  const stage = currentPriceStage(trip.priceStages, today);
  const cost = stage?.amountUsd ?? null;
  return (
    <div className={styles.priceRow}>
      <span className={styles.cost}>{cost === null ? "TBD" : usd.format(cost)}</span>
      {stage && trip.priceStages.length > 1 && (
        <span className={styles.stage}>
          {stage.label}
          {stage.validUntil && `, until ${monthDay.format(new Date(`${stage.validUntil}T00:00:00Z`))}`}
        </span>
      )}
      {trip.priceIncludes && <PriceInfo text={trip.priceIncludes} />}
    </div>
  );
}

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
