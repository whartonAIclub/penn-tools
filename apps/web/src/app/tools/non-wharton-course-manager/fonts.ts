// Penn Modern fonts, from Google Fonts through Next.js (served with the site,
// no extra library). Each sets a CSS variable that CourseManager.module.css uses.

import { DM_Mono, Inter, Newsreader } from "next/font/google";

/** Headings and big numbers, always weight 400. */
export const serif = Newsreader({ subsets: ["latin"], axes: ["opsz"], variable: "--nwcm-serif" });

/** Body text. */
export const sans = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--nwcm-sans" });

/** Uppercase labels, course codes and status pills. */
export const mono = DM_Mono({ subsets: ["latin"], weight: "500", variable: "--nwcm-mono" });
