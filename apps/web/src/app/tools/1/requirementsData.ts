// Wharton MBA graduation requirements
// Source: https://mba-inside.wharton.upenn.edu/core-curriculum/
// courseIds match the format used in courseCatalog.ts (e.g. "FNCE6110")

export interface RequirementGroup {
  id: string;
  category: "Fixed Core" | "Flexible Core";
  label: string;
  options: string[];       // qualifying courseIds
  cuNeeded: number;
  type: "any" | "cumulative"; // "any" = one qualifying course, "cumulative" = total CU >= cuNeeded
  optionLabels?: string[]; // human-readable option descriptions
}

export const FIXED_CORE: RequirementGroup[] = [
  {
    id: "mgmt-6100",
    category: "Fixed Core",
    label: "Foundations of Teamwork & Leadership",
    options: ["MGMT6100"],
    cuNeeded: 0.5,
    type: "any",
  },
  {
    id: "mktg-6110",
    category: "Fixed Core",
    label: "Marketing Management",
    options: ["MKTG6110"],
    cuNeeded: 0.5,
    type: "any",
  },
  {
    id: "bepp-6110",
    category: "Fixed Core",
    label: "Microeconomics for Managers: Foundations",
    options: ["BEPP6110"],
    cuNeeded: 0.5,
    type: "any",
  },
  {
    id: "bepp-6120",
    category: "Fixed Core",
    label: "Advanced Microeconomics for Managers",
    options: ["BEPP6120"],
    cuNeeded: 0.5,
    type: "any",
  },
  {
    id: "stat",
    category: "Fixed Core",
    label: "Statistics",
    options: ["STAT6130", "STAT6210"],
    cuNeeded: 0.5,
    type: "any",
    optionLabels: ["STAT 6130 – Regression Analysis for Business (1.0 CU)", "STAT 6210 – Accelerated Regression Analysis (0.5 CU)"],
  },
  {
    id: "whcp",
    category: "Fixed Core",
    label: "Management Communication",
    options: ["WHCP6160", "WHCP6180"],
    cuNeeded: 0.5,
    type: "any",
    optionLabels: ["WHCP 6160 – Management Communication", "WHCP 6180 – Entrepreneurial Communication"],
  },
];

export const FLEXIBLE_CORE: RequirementGroup[] = [
  {
    id: "accounting",
    category: "Flexible Core",
    label: "Accounting",
    options: ["ACCT6110", "ACCT6130"],
    cuNeeded: 1.0,
    type: "any",
    optionLabels: ["ACCT 6110 – Fundamentals of Financial Accounting", "ACCT 6130 – Financial & Managerial Accounting"],
  },
  {
    id: "corporate-finance",
    category: "Flexible Core",
    label: "Corporate Finance",
    options: ["FNCE6110", "FNCE6210"],
    cuNeeded: 0.5,
    type: "any",
    optionLabels: ["FNCE 6110 – Corporate Finance (1.0 CU)", "FNCE 6210 – Accelerated Corporate Finance (0.5 CU)"],
  },
  {
    id: "legal-studies",
    category: "Flexible Core",
    label: "Legal Studies",
    options: ["LGST6110", "LGST6120", "LGST6130"],
    cuNeeded: 0.5,
    type: "any",
    optionLabels: ["LGST 6110", "LGST 6120", "LGST 6130 – Business, Social Responsibility & the Environment"],
  },
  {
    id: "macroeconomics",
    category: "Flexible Core",
    label: "Macroeconomics",
    options: ["FNCE6130", "FNCE6230"],
    cuNeeded: 0.5,
    type: "any",
    optionLabels: ["FNCE 6130 – Macroeconomics and the Global Economy (1.0 CU)", "FNCE 6230 – Macroeconomics & Global Economic Environment (0.5 CU)"],
  },
  {
    id: "management",
    category: "Flexible Core",
    label: "Management",
    options: ["MGMT6110", "MGMT6120"],
    cuNeeded: 1.0,
    type: "any",
    optionLabels: ["MGMT 6110 – Managing Established Enterprises", "MGMT 6120 – Managing Emerging Enterprises"],
  },
  {
    id: "marketing-flex",
    category: "Flexible Core",
    label: "Marketing Strategy",
    options: ["MKTG6120", "MKTG6130"],
    cuNeeded: 0.5,
    type: "any",
    optionLabels: ["MKTG 6120 – Dynamic Marketing Strategy", "MKTG 6130 – Marketing Research"],
  },
  {
    id: "oidd",
    category: "Flexible Core",
    label: "Operations, Information & Decisions",
    options: ["OIDD6110", "OIDD6120", "OIDD6130", "OIDD6140", "OIDD6150", "OIDD6160"],
    cuNeeded: 1.0,
    type: "cumulative",
    optionLabels: ["1.0 CU total from approved OIDD courses (OIDD 6110–6160)"],
  },
];

export const TOTAL_CU_REQUIRED = 19.0;
export const WHARTON_CU_REQUIRED = 15.0;
