export interface RawSection {
  sectionId: string;
  courseId: string;
  courseTitle: string;
  days: string;
  time: string;
  quarter: string;
  instructor: string;
  cu: string | number;
  department: string;
  crossListedAs?: string;
  notes?: string;
}

export interface Meeting {
  day: number;    // 0=Mon … 4=Fri
  start: number;  // minutes from midnight
  end: number;
  quarter: string;
}

export interface Section {
  sectionId: string;
  courseId: string;
  courseTitle: string;
  days: string;
  time: string;
  quarter: string;
  instructor: string;
  cu: number;
  department: string;
  meetings: Meeting[];
}

export interface CourseGroup {
  groupKey: string;
  courseIds: string[];
  displayCourseIds: string;
  title: string;
  cu: number;
  departments: string[];
  sections: Section[];
}

export type Priority = "high" | "medium" | "low";

export interface ShortlistItem {
  courseGroup: CourseGroup;
  priority: Priority;
  clientId: string;
}

export interface ScheduleSolution {
  sections: Section[];
  totalCu: number;
  gapsFilled: number;
  priorityScore: number;
  mediumCount: number;
  lowCount: number;
}
