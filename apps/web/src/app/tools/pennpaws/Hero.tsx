// The welcome band at the top of PennPaws: a plum panel with a big headline
// and a real photo beside it. Owners see their own pet when they've added a
// photo, so the first thing on the page is who this is all for.
//
// Photos are from Unsplash (Unsplash License: free to use, no credit needed),
// shrunk to web size and kept in ./photos.

import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";
import catNap from "./photos/cat-nap.jpg";
import dogWalk from "./photos/dog-walk.jpg";
import ownerHug from "./photos/owner-hug.jpg";
import sitterBench from "./photos/sitter-bench.jpg";
import styles from "./PennPaws.module.css";

export const PHOTOS = { catNap, dogWalk, ownerHug, sitterBench } satisfies Record<string, StaticImageData>;

/** A word circled by hand, the way you'd mark what matters on paper. */
export function Circled({ children }: { children: ReactNode }) {
  return (
    <span className={styles.circled}>
      {children}
      <svg className={styles.scribble} viewBox="0 0 240 80" preserveAspectRatio="none" aria-hidden="true">
        <path d="M18 46 C 12 18, 120 6, 214 18 C 238 22, 236 56, 196 64 C 140 76, 40 74, 16 54 C 4 44, 30 26, 92 20" />
      </svg>
    </span>
  );
}

/** A hand-drawn swoosh under a phrase. */
export function Underlined({ children }: { children: ReactNode }) {
  return (
    <span className={styles.underlined}>
      {children}
      <svg className={styles.swoosh} viewBox="0 0 240 16" preserveAspectRatio="none" aria-hidden="true">
        <path d="M4 10 C 60 4, 150 2, 236 9" />
      </svg>
    </span>
  );
}

export function Hero({
  title,
  lead,
  photo,
  photoAlt,
  compact = false,
}: {
  title: ReactNode;
  lead: ReactNode;
  /** A static photo, or a pet's own photo as a data URL. */
  photo: StaticImageData | string;
  photoAlt: string;
  compact?: boolean;
}) {
  return (
    <section className={compact ? `${styles.hero} ${styles.heroCompact}` : styles.hero}>
      <div className={styles.heroText}>
        <h2 className={styles.heroTitle}>{title}</h2>
        <p className={styles.heroLead}>{lead}</p>
      </div>
      <div className={styles.heroPhoto}>
        {typeof photo === "string" ? (
          // A pet's own photo is a small data URL; next/image adds nothing to it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={photoAlt} />
        ) : (
          <Image src={photo} alt={photoAlt} fill sizes="(max-width: 720px) 100vw, 320px" placeholder="blur" priority />
        )}
      </div>
    </section>
  );
}
