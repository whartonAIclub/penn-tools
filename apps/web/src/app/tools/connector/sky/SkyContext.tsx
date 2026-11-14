"use client";

// What the starry sky behind Connector's pages shows. Pages set the scene with
// useSkyScene; a page that sets nothing gets the full, untouched sky.

import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject } from "react";

export interface SkyScene {
  /** How far through the questions the student is, 0 to 1: stars fade as it grows. */
  progress: number;
  /** How many matches to link to the student's star at the end, or null for none yet. */
  matches: number | null;
}

export const FULL_SKY: SkyScene = { progress: 0, matches: null };

const SkyContext = createContext<{ scene: MutableRefObject<SkyScene>; setScene: (scene: SkyScene) => void } | null>(
  null,
);

export function SkyProvider({ children }: { children: React.ReactNode }) {
  // A ref, not state: the sky reads it every frame, and changing it shouldn't re-render pages.
  const scene = useRef<SkyScene>(FULL_SKY);
  const [value] = useState(() => ({ scene, setScene: (next: SkyScene) => (scene.current = next) }));
  return <SkyContext.Provider value={value}>{children}</SkyContext.Provider>;
}

/** The current scene, for the sky to read each frame. */
export function useSkySceneRef(): MutableRefObject<SkyScene> {
  const sky = useContext(SkyContext);
  if (!sky) throw new Error("useSkySceneRef must be used inside SkyProvider");
  return sky.scene;
}

/** Shows this scene while the calling component is on screen, then returns to the full sky. */
export function useSkyScene(progress: number, matches: number | null = null) {
  const sky = useContext(SkyContext);
  useEffect(() => {
    sky?.setScene({ progress, matches });
  }, [sky, progress, matches]);
  useEffect(() => () => sky?.setScene(FULL_SKY), [sky]);
}

/** For server-rendered pages: sets the sky's scene from inside them. */
export function SkyScene({ progress, matches = null }: { progress: number; matches?: number | null }) {
  useSkyScene(progress, matches);
  return null;
}
