// Non-Wharton Course Manager: helps MBA students take a Penn course outside
// Wharton in three steps. Works signed out; everything stays in the browser.

import type { Metadata } from "next";
import { CourseManager } from "./CourseManager";

export const metadata: Metadata = {
  title: "Non-Wharton Course Manager",
};

export default function NonWhartonCourseManagerPage() {
  return <CourseManager />;
}
