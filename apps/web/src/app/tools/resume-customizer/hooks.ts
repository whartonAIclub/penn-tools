// Hooks the Resume Customizer's screens share.

import { useCallback, useEffect, useState } from "react";
import type { ExportSettings, ResumeDoc } from "@penntools/tool-resume-customizer/resume";
import { countPages } from "./exportResume";

/** A column's width, changed by dragging a DragHandle. `inverted` for a column right of its handle. */
export function useResizable(initial: number, min: number, max: number, inverted = false) {
  const [width, setWidth] = useState(initial);
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = width;
      const onMove = (ev: MouseEvent) => {
        const delta = inverted ? startX - ev.clientX : ev.clientX - startX;
        setWidth(Math.min(max, Math.max(min, startW + delta)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, min, max, inverted],
  );
  return { width, onMouseDown };
}

/** Drag-and-drop handlers for an area, and whether files are being dragged over it. */
export function useFileDrop(onFiles: (files: FileList) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const handlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    },
    // Leaving for one of the area's own children isn't leaving the area.
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      onFiles(e.dataTransfer.files);
    },
  };
  return { isDragging, handlers };
}

/**
 * How many pages the PDF would have, recounted after edits settle: null until
 * the first count (or if counting fails), then the latest count, kept while
 * the next one runs.
 */
export function usePageCount(doc: ResumeDoc | null, settings: ExportSettings): number | null {
  const [pages, setPages] = useState<number | null>(null);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      countPages(doc, settings)
        .then((n) => {
          if (!cancelled) setPages(n);
        })
        .catch(() => {
          if (!cancelled) setPages(null);
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc, settings]);
  return pages;
}
