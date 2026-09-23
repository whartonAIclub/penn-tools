/** Shared design tokens for Compass tool-19. */
export const C = {
  // Backgrounds
  pageBg:       "#FAF8F4",
  surface:      "#FFFFFF",
  surfaceMuted: "#FDFCFA",
  surfaceWarm:  "#F5F2ED",

  // Borders
  border:       "#E8E4DC",
  borderMuted:  "#EDE9E2",
  borderStrong: "#D4CFC8",

  // Sage (primary)
  sage:         "#7A9E7E",
  sageDark:     "#4B7352",
  sageDarker:   "#3F6C46",
  sageLight:    "rgba(122,158,126,0.10)",
  sageBorder:   "rgba(122,158,126,0.22)",
  sageHover:    "#6B8D6F",

  // Terracotta (CTA)
  terra:        "#C4704F",
  terraDark:    "#A35838",
  terraLight:   "rgba(196,112,79,0.08)",
  terraBorder:  "rgba(196,112,79,0.18)",
  terraHover:   "#A35838",

  // Text
  text:         "#2C1A0E",
  textMuted:    "#6E6257",
  textLight:    "#8A7B6D",
  taupe:        "#B5A898",

  // Misc
  stone:        "#F5F2ED",
  stoneLight:   "#FAF8F5",
  stoneBorder:  "#E0DCD4",
} as const;

export const shadow = {
  sm:  "0 1px 3px rgba(44,26,14,0.07), 0 1px 2px rgba(44,26,14,0.04)",
  md:  "0 4px 8px rgba(44,26,14,0.08), 0 2px 4px rgba(44,26,14,0.04)",
  lg:  "0 10px 20px rgba(44,26,14,0.09), 0 4px 8px rgba(44,26,14,0.05)",
  xl:  "0 20px 32px rgba(44,26,14,0.10), 0 8px 16px rgba(44,26,14,0.06)",
} as const;
