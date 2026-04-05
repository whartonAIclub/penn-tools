// Mock data simulating Canvas (coursework) and Wharton CareerPath (recruiting) integrations
// In production, these would be real API calls with OAuth tokens

export interface ExternalTask {
  externalId: string;
  title: string;
  description?: string;
  source: "canvas" | "careerpath";
  type: string;
  dueDate: Date;
  course?: string;
  company?: string;
  estimatedMinutes?: number;
}

function daysFromNow(days: number, hour = 23): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 59, 0, 0);
  return d;
}

export function getMockCanvasTasks(): ExternalTask[] {
  return [
    // Overdue
    {
      externalId: "canvas-000",
      title: "LGST 612: Ethics Reflection Paper",
      description: "2-page reflection on the Enron case and stakeholder theory",
      source: "canvas",
      type: "assignment",
      dueDate: daysFromNow(-2),
      course: "LGST 612: Business Ethics",
      estimatedMinutes: 60,
    },
    {
      externalId: "canvas-007",
      title: "MGMT 611: Peer Feedback Submission",
      description: "Submit 360 feedback for teammates on Milestone 1",
      source: "canvas",
      type: "assignment",
      dueDate: daysFromNow(-1),
      course: "MGMT 611: Strategy",
      estimatedMinutes: 20,
    },
    // Due today
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
      externalId: "canvas-008",
      title: "FNCE 601: Reading Quiz – Ch. 9",
      description: "10-question online quiz on capital structure",
      source: "canvas",
      type: "quiz",
      dueDate: daysFromNow(0, 23),
      course: "FNCE 601: Corporate Finance",
      estimatedMinutes: 20,
    },
    // Next 2 days
    {
      externalId: "canvas-002",
      title: "FNCE 601: Corporate Finance Problem Set 4",
      description: "DCF valuation and WACC problems",
      source: "canvas",
      type: "assignment",
      dueDate: daysFromNow(1),
      course: "FNCE 601: Corporate Finance",
      estimatedMinutes: 120,
    },
    {
      externalId: "canvas-006",
      title: "ACCT 613: Quiz – Revenue Recognition",
      description: "Online quiz on ASC 606",
      source: "canvas",
      type: "quiz",
      dueDate: daysFromNow(2),
      course: "ACCT 613: Financial Accounting",
      estimatedMinutes: 30,
    },
    // Upcoming
    {
      externalId: "canvas-003",
      title: "MKTG 612: Midterm Exam",
      description: "Covers consumer behavior, segmentation, and positioning",
      source: "canvas",
      type: "exam",
      dueDate: daysFromNow(4),
      course: "MKTG 612: Marketing Management",
      estimatedMinutes: 180,
    },
    {
      externalId: "canvas-004",
      title: "OIDD 615: Operations Simulation Reflection",
      description: "500-word reflection on the Beer Game simulation",
      source: "canvas",
      type: "assignment",
      dueDate: daysFromNow(5),
      course: "OIDD 615: Operations Management",
      estimatedMinutes: 45,
    },
    {
      externalId: "canvas-005",
      title: "MGMT 611: Team Project Milestone 2",
      description: "Industry analysis slide deck (10 slides)",
      source: "canvas",
      type: "assignment",
      dueDate: daysFromNow(7),
      course: "MGMT 611: Strategy",
      estimatedMinutes: 180,
    },
    {
      externalId: "canvas-009",
      title: "REAL 721: Property Valuation Assignment",
      description: "Cap rate analysis for 3 commercial properties",
      source: "canvas",
      type: "assignment",
      dueDate: daysFromNow(9),
      course: "REAL 721: Real Estate Finance",
      estimatedMinutes: 90,
    },
    {
      externalId: "canvas-010",
      title: "STAT 613: Regression Project – Final Report",
      description: "Submit R code + written report for regression analysis project",
      source: "canvas",
      type: "assignment",
      dueDate: daysFromNow(12),
      course: "STAT 613: Regression Analysis",
      estimatedMinutes: 240,
    },
  ];
}

export function getMockCareerPathTasks(): ExternalTask[] {
  return [
    // Overdue
    {
      externalId: "cp-000",
      title: "Deloitte S&O: Submit Updated Resume",
      description: "Recruiter requested revised resume with quantified bullets",
      source: "careerpath",
      type: "application",
      dueDate: daysFromNow(-1),
      company: "Deloitte S&O",
      estimatedMinutes: 45,
    },
    // Due today
    {
      externalId: "cp-001",
      title: "McKinsey First Round Interview",
      description: "Two case interviews + fit. Prepare STAR stories and market sizing.",
      source: "careerpath",
      type: "interview",
      dueDate: daysFromNow(0, 14),
      company: "McKinsey & Company",
      estimatedMinutes: 60,
    },
    // Next 2 days
    {
      externalId: "cp-002",
      title: "Goldman Sachs Application Deadline",
      description: "Summer associate application — resume, cover letter, and video essay",
      source: "careerpath",
      type: "application",
      dueDate: daysFromNow(1),
      company: "Goldman Sachs",
      estimatedMinutes: 90,
    },
    {
      externalId: "cp-006",
      title: "Sequoia Capital: HireVue Video Interview",
      description: "3 behavioral questions, 2 min each. Record and submit online.",
      source: "careerpath",
      type: "interview",
      dueDate: daysFromNow(2),
      company: "Sequoia Capital",
      estimatedMinutes: 40,
    },
    // Upcoming
    {
      externalId: "cp-003",
      title: "Case Prep: BCG Practice Session",
      description: "Scheduled practice with classmate — profit decline framework",
      source: "careerpath",
      type: "case_prep",
      dueDate: daysFromNow(3),
      company: "BCG",
      estimatedMinutes: 75,
    },
    {
      externalId: "cp-004",
      title: "Bain Coffee Chat",
      description: "Informational with Bain senior associate (Penn Alum)",
      source: "careerpath",
      type: "networking",
      dueDate: daysFromNow(4),
      company: "Bain & Company",
      estimatedMinutes: 30,
    },
    {
      externalId: "cp-005",
      title: "Amazon Leadership Essay Questions",
      description: "4 leadership principle essays, 300 words each",
      source: "careerpath",
      type: "application",
      dueDate: daysFromNow(6),
      company: "Amazon",
      estimatedMinutes: 120,
    },
    {
      externalId: "cp-007",
      title: "JP Morgan: Superday Preparation",
      description: "Final round — 5 interviews. Review technical finance and fit questions.",
      source: "careerpath",
      type: "interview",
      dueDate: daysFromNow(8),
      company: "JP Morgan",
      estimatedMinutes: 180,
    },
    {
      externalId: "cp-008",
      title: "Wharton Career Fair: Research 10 Companies",
      description: "Review target companies' recent news, culture, and open roles",
      source: "careerpath",
      type: "networking",
      dueDate: daysFromNow(10),
      company: "Multiple",
      estimatedMinutes: 60,
    },
  ];
}
