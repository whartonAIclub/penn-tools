import type { ExternalTask } from "./types";

function daysFromNow(days: number, hour = 23): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 59, 0, 0);
  return d.toISOString();
}

export function getMockCanvasTasks(): ExternalTask[] {
  return [
    {
      externalId: "canvas-001",
      title: "MGMT 611: Strategy Case Write-up",
      description: "3-page analysis of the Netflix case study",
      source: "canvas",
      type: "assignment",
      dueDate: daysFromNow(0, 17),
      course: "MGMT 611: Strategy",
      estimatedMinutes: 90,
    },
    {
      externalId: "canvas-002",
      title: "FNCE 601: Problem Set 4",
      description: "DCF valuation and WACC problems",
      source: "canvas",
      type: "assignment",
      dueDate: daysFromNow(1),
      course: "FNCE 601: Corporate Finance",
      estimatedMinutes: 120,
    },
    {
      externalId: "canvas-003",
      title: "MKTG 612: Midterm Exam",
      description: "Covers consumer behavior and positioning",
      source: "canvas",
      type: "exam",
      dueDate: daysFromNow(4),
      course: "MKTG 612: Marketing Management",
      estimatedMinutes: 180,
    },
  ];
}

export function getMockCareerPathTasks(): ExternalTask[] {
  return [
    {
      externalId: "cp-001",
      title: "McKinsey First Round Interview",
      description: "Two case interviews + fit",
      source: "careerpath",
      type: "interview",
      dueDate: daysFromNow(0, 14),
      company: "McKinsey & Company",
      estimatedMinutes: 60,
    },
    {
      externalId: "cp-002",
      title: "Goldman Sachs Application Deadline",
      description: "Resume, cover letter, and video essay",
      source: "careerpath",
      type: "application",
      dueDate: daysFromNow(1),
      company: "Goldman Sachs",
      estimatedMinutes: 90,
    },
    {
      externalId: "cp-003",
      title: "BCG Case Prep Session",
      description: "Practice with classmate: profit decline framework",
      source: "careerpath",
      type: "case_prep",
      dueDate: daysFromNow(3),
      company: "BCG",
      estimatedMinutes: 75,
    },
  ];
}
