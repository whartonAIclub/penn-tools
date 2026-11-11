// Wharton MBA majors and what each requires, transcribed from the department
// pages linked from https://mba-inside.wharton.upenn.edu/majors/ (each
// major's `source`). Retrieved 2026-11-03. Departments revise these lists,
// so recheck them when refreshing the course list each semester.
//
// Not included: the Individualized Major (designed with an advisor) and
// Legal Studies & Business Ethics, which offers no MBA major of its own; its
// courses count toward the majors below, as their lists show.
//
// How a major is described:
// - `credits` is the major's total course units (CU), as Wharton states it.
//   Some totals include core courses (Finance, Marketing, OID); most are
//   "beyond the core".
// - Each group lists the courses that count for it, either by code or as a
//   whole department. A course counts toward the major if it is in any
//   group. A group's `minCredits` must come from it and at most `maxCredits`
//   may. A `required` group means every course in it.
// - A cross-listed course is written with all its codes, "REAL 7210 / FNCE 7210".
// - `core` groups are Wharton core courses nearly every student takes anyway.
// - Limits on independent studies, Global Modular Courses and non-Wharton
//   courses are left in `notes`; they don't appear in the course list.

export interface DepartmentSelector {
  department: string;
  /** Only course numbers at or above this, e.g. 7000 for "upper-level". */
  minNumber?: number;
  /** Codes in the department that don't count, e.g. its core courses. */
  exclude?: string[];
}

export interface CourseGroup {
  label: string;
  courses?: string[];
  departments?: DepartmentSelector[];
  minCredits: number;
  maxCredits?: number;
  /** Every course listed must be taken. */
  required?: boolean;
  /** Wharton core courses, which most students take regardless of major. */
  core?: boolean;
}

export interface Major {
  id: string;
  name: string;
  /** Total CU the major requires. */
  credits: number;
  groups: CourseGroup[];
  /** Majors that can't be declared together with this one. */
  cannotCombineWith: string[];
  notes: string[];
  source: string;
}

/** Splits "REAL 7210 / FNCE 7210" into its codes. */
export function courseCodes(entry: string): string[] {
  return entry.split("/").map((code) => code.trim());
}

export const MAJORS_RETRIEVED = "2026-11-03";

const MGMT_CORE = ["MGMT 6100", "MGMT 6110", "MGMT 6120", "MGMT 6130"];
const NEGOTIATIONS = "MGMT 6910 / LGST 8060 / OIDD 6910";
const MKTG_CORE: CourseGroup[] = [
  { label: "Marketing core", courses: ["MKTG 6110"], minCredits: 0.5, required: true, core: true },
  { label: "Marketing core (one of)", courses: ["MKTG 6120", "MKTG 6130"], minCredits: 0.5, core: true },
];
const OIDD_FLEX_CORE = [
  "OIDD 6110",
  "OIDD 6120",
  "OIDD 6130",
  "OIDD 6140",
  "OIDD 6150",
  "OIDD 6620",
  "OIDD 6900 / MGMT 6900",
];
const MKTG_RESEARCH = ["MKTG 7120", "MKTG 7710", "MKTG 7760 / STAT 7760", "MKTG 8090"];
const FNCE_CORE: CourseGroup = {
  label: "Finance core",
  courses: ["FNCE 6110", "FNCE 6130"],
  minCredits: 2,
  required: true,
  core: true,
};

// The Environmental and Social & Governance lists are shared by BEES, IVSB and SOGB.
const ENVIRONMENTAL = [
  "ACCT 7640 / BEPP 7640",
  "BEPP 7610 / FNCE 7610 / OIDD 7610",
  "BEPP 7630 / OIDD 7630",
  "LGST 8150",
  "LGST 6470",
  "LGST 7620 / OIDD 7620",
  "MGMT 7230",
  "OIDD 5250",
];
const SOCIAL_GOVERNANCE = [
  "ACCT 7470",
  "BEPP 7700",
  "BEPP 7730 / REAL 7300 / FNCE 7300",
  "FNCE 7540",
  "FNCE 8020",
  "LGST 6420",
  "LGST 6430",
  "LGST 8020",
  "LGST 8080",
  "MGMT 6240",
  "MGMT 6250",
  "MGMT 7150",
  "MGMT 7860",
  "MGMT 7900",
  "MGMT 8120",
];
const ESG_NOTES = [
  "Up to 1 CU may come from pre-approved non-Wharton courses with advance permission.",
  "Global Modular Courses on sustainability or impact may count by application.",
];

export const MAJORS: readonly Major[] = [
  {
    id: "accounting",
    name: "Accounting",
    credits: 4,
    groups: [
      { label: "Financial accounting", courses: ["ACCT 7420"], minCredits: 1, required: true },
      {
        label: "Accounting electives",
        courses: [
          "ACCT 7060",
          "ACCT 7430",
          "ACCT 7470",
          "ACCT 7640 / BEPP 7640",
          "ACCT 7900",
          "ACCT 7970",
          "FNCE 7070",
        ],
        departments: [{ department: "ACCT", minNumber: 7000 }],
        minCredits: 3,
      },
    ],
    cannotCombineWith: [],
    notes: [
      "Core ACCT 6110/6130 don't count but are prerequisites.",
      "The page lists specific electives but says any graduate ACCT course counts, so newer ones (e.g. ACCT 7700) are included.",
      "ACCT 7430 is recommended for anyone planning to sit for the CPA exam.",
      "Up to 1 CU of independent study with department approval.",
    ],
    source: "https://accounting.wharton.upenn.edu/programs/mba/acct-major/",
  },
  {
    id: "ai-for-business",
    name: "Artificial Intelligence for Business",
    credits: 4,
    groups: [
      { label: "Required", courses: ["STAT 7230", "LGST 6420"], minCredits: 1.5, required: true },
      {
        label: "Foundations of AI (Pillar F)",
        courses: [
          "FNCE 7370",
          "FNCE 7800",
          "HCMG 8530",
          "HCMG 8570",
          "MKTG 7120",
          "MKTG 7370",
          "MKTG 7680",
          "MKTG 9560",
          "OIDD 6620",
          "OIDD 7770 / STAT 7770",
          "STAT 7010",
          "STAT 7730",
          "STAT 5810 / OIDD 5810",
          "STAT 5850",
        ],
        minCredits: 1,
      },
      {
        label: "Impact of AI (Pillar I)",
        courses: [
          "HCMG 8580",
          "MGMT 7310",
          "MGMT 7430",
          "MGMT 8020",
          "MGMT 8130 / OIDD 8130",
          "MKTG 7270",
          "MKTG 7340",
          "MKTG 7790",
          "OIDD 6130",
          "OIDD 6670",
          "OIDD 6960",
        ],
        minCredits: 1.5,
      },
    ],
    cannotCombineWith: [],
    notes: [
      "OIDD 6130 and OIDD 6620 can't count toward both this major and the OIDD flex core.",
      "Up to 1 CU of independent study and 1 CU of non-Wharton Penn courses with advisor approval.",
    ],
    source: "https://oid.wharton.upenn.edu/artificial-intelligence-mba/",
  },
  {
    id: "business-analytics",
    name: "Business Analytics",
    credits: 6,
    groups: [
      { label: "Statistics core", courses: ["STAT 6130", "STAT 6210"], minCredits: 1, core: true },
      { label: "OIDD requirement", courses: ["OIDD 6120"], minCredits: 0.5, required: true },
      { label: "OIDD requirement (one of)", courses: ["OIDD 6110", "OIDD 6150"], minCredits: 0.5 },
      {
        label: "Analytics electives",
        courses: [
          "ACCT 7420",
          "ACCT 7470",
          "BEPP 6130 / BEPP 8930 / BEPP 8970",
          "FNCE 7050",
          "FNCE 7170",
          "FNCE 7370",
          "FNCE 7800",
          "HCMG 8570",
          "LGST 6420",
          "MGMT 7930 / OIDD 7930",
          "MKTG 7120",
          "MKTG 7270",
          "MKTG 7520",
          "MKTG 7540",
          "MKTG 7710",
          "MKTG 7760 / STAT 7760",
          "MKTG 8090",
          "MKTG 8520",
          "OIDD 5250",
          "OIDD 6360",
          "OIDD 6420",
          "OIDD 6430",
          "OIDD 6530",
          "OIDD 6590",
          "OIDD 6620",
          "OIDD 6670",
          "REAL 8700",
          "STAT 7010",
          "STAT 7050",
          "STAT 7100",
          "STAT 7110",
          "STAT 7220",
          "STAT 7230",
          "STAT 7240",
          "STAT 7250",
          "STAT 7700",
          "STAT 7730",
          "STAT 7770 / OIDD 7770",
          "STAT 9740",
        ],
        minCredits: 4,
      },
    ],
    cannotCombineWith: [],
    notes: [
      "Total is 6 CU: the STAT core (1), the OIDD requirements (1) and 4 CU of electives.",
      "Only one of MKTG 7520 and MKTG 8520 counts.",
      "Up to 1 CU from approved non-Wharton courses (CIS, CIT, MUSA, EDUC, NPLD) and 1 CU of independent study.",
    ],
    source: "https://mba-inside.wharton.upenn.edu/buan-major/",
  },
  {
    id: "bepp",
    name: "Business Economics & Public Policy",
    credits: 4,
    groups: [{ label: "BEPP courses", departments: [{ department: "BEPP" }], minCredits: 4 }],
    cannotCombineWith: [],
    notes: [
      "With approval, 1 CU may come from another Wharton department or Penn school (health care, energy, environment, taxation, international finance have been approved before).",
      "Suggested areas: International Policy and Domestic Policy.",
    ],
    source: "https://bepp.wharton.upenn.edu/programs/mba/business-and-public-policy/",
  },
  {
    id: "bees",
    name: "Business, Energy, Environment & Sustainability",
    credits: 4,
    groups: [
      { label: "Environmental", courses: ENVIRONMENTAL, minCredits: 3 },
      { label: "Social & Governance", courses: SOCIAL_GOVERNANCE, minCredits: 0, maxCredits: 1 },
    ],
    cannotCombineWith: ["ivsb"],
    notes: ESG_NOTES,
    source: "https://esg.wharton.upenn.edu/students/mba-bees-major/",
  },
  {
    id: "entrepreneurship",
    name: "Entrepreneurship & Innovation",
    credits: 4,
    groups: [
      { label: "Required", courses: ["MGMT 8010"], minCredits: 0.5, required: true },
      {
        label: "E&I electives",
        courses: [
          "ACCT 7900",
          "FNCE 7500",
          "FNCE 7510",
          "HCMG 8670",
          "LGST 8130",
          NEGOTIATIONS,
          "MGMT 6920 / LGST 6920 / OIDD 6920",
          "MGMT 7120",
          "MGMT 7210",
          "MGMT 7290 / LGST 7290",
          "MGMT 7310",
          "MGMT 8020",
          "MGMT 8040",
          "MGMT 8090",
          "MGMT 8110",
          "MGMT 8120",
          "MGMT 8140",
          "MGMT 8160",
          "MGMT 8170",
          "MGMT 8310",
          "MGMT 8320",
          "MGMT 8330",
          "MGMT 8880",
          "MKTG 7210",
          "MKTG 7270",
          "MKTG 7340",
          "MKTG 7410",
          "OIDD 5150",
          "OIDD 6140",
          "OIDD 6360",
          "OIDD 6520",
          "OIDD 6540",
          "OIDD 6620",
          "OIDD 6670",
          "REAL 8910",
        ],
        minCredits: 3.5,
      },
    ],
    cannotCombineWith: [],
    notes: [
      "MGMT 8010 has no waivers; take it before the electives if possible.",
      "Only one of Negotiations (MGMT 6910) and Advanced Negotiation (MGMT 6920) counts.",
      "Only 0.5 CU of MGMT 8170 counts.",
      "Counting more than one of OIDD 5150, 6520 and 6540 needs advisor approval.",
      "OIDD 6140 and OIDD 6620 can't count toward both this major and the OIDD flex core.",
    ],
    source: "https://mgmt.wharton.upenn.edu/programs/mba/entrepreneurship-innovation/",
  },
  {
    id: "finance",
    name: "Finance",
    credits: 6,
    groups: [
      FNCE_CORE,
      {
        label: "Upper-level Finance electives",
        departments: [{ department: "FNCE", minNumber: 7000 }],
        minCredits: 4,
      },
    ],
    cannotCombineWith: ["quant-finance"],
    notes: [
      "Courses from other departments count only if cross-listed with FNCE.",
      "Up to 1 CU combined of independent study (FNCE 8990) and approved Global Modular Courses.",
      "The department doesn't waive the core but allows substituting an upper-level course.",
    ],
    source: "https://fnce.wharton.upenn.edu/course-requirements-finance-major/",
  },
  {
    id: "health-care",
    name: "Health Care Management",
    credits: 5,
    groups: [
      { label: "Required", courses: ["HCMG 8410", "HCMG 6530"], minCredits: 2, required: true },
      {
        label: "Health care electives",
        courses: [
          "HCMG 8450",
          "HCMG 8480",
          "HCMG 8500",
          "HCMG 8520",
          "HCMG 8530",
          "HCMG 8550",
          "HCMG 8570",
          "HCMG 8580",
          "HCMG 8590",
          "HCMG 8600",
          "HCMG 8630",
          "HCMG 8660",
          "HCMG 8670",
          "HCMG 8680",
          "HCMG 8700",
          "HCMG 8740",
          "HCMG 8770",
          "HCMG 8900",
          "HCMG 8980",
        ],
        minCredits: 3,
      },
    ],
    cannotCombineWith: [],
    notes: [],
    source: "https://hcmg.wharton.upenn.edu/programs/mba/hcmg-major-requirements/",
  },
  {
    id: "ivsb",
    name: "Impact, Value & Sustainable Business",
    credits: 4,
    groups: [
      { label: "Environmental", courses: ENVIRONMENTAL, minCredits: 2 },
      { label: "Social & Governance", courses: SOCIAL_GOVERNANCE, minCredits: 0 },
    ],
    cannotCombineWith: ["bees", "social-governance"],
    notes: ["New for 2026–27.", ...ESG_NOTES],
    source: "https://impact.wharton.upenn.edu/students/mba-major-impact-value-and-sustainable-business/",
  },
  {
    id: "leading-across-differences",
    name: "Leading Across Differences",
    credits: 4,
    groups: [
      {
        label: "Foundational",
        courses: ["LGST 6420", "MGMT 6240", "MGMT 6710", "MGMT 7280", "MGMT 7720", "MGMT 7940"],
        minCredits: 1.5,
      },
      {
        label: "Other LAD electives",
        courses: [
          "LGST 8080",
          NEGOTIATIONS,
          "MGMT 7730",
          "MGMT 7860",
          "MGMT 7900",
          "MGMT 7930 / OIDD 7930",
          "OIDD 6900 / MGMT 6900",
          "OIDD 6930",
        ],
        minCredits: 0,
      },
    ],
    cannotCombineWith: [],
    notes: [
      "OIDD 6900 can't count toward both this major and the OIDD flex core.",
      "Up to 1 CU from related Global Modular/Virtual Courses, ASPs, independent studies or non-Wharton courses with approval.",
    ],
    source: "https://mgmt.wharton.upenn.edu/programs/mba/lad-major/",
  },
  {
    id: "management",
    name: "Management",
    credits: 4,
    groups: [
      {
        label: "Management electives",
        courses: [NEGOTIATIONS, "LGST 8090"],
        departments: [{ department: "MGMT", exclude: MGMT_CORE }],
        minCredits: 4,
      },
    ],
    cannotCombineWith: [],
    notes: [
      "Any MGMT elective beyond the core counts.",
      "Up to 1 CU combined of Global Modular Courses, ASPs and independent studies.",
      "MGMT 6900 can't count toward both this major and the OIDD flex core.",
    ],
    source: "https://mgmt.wharton.upenn.edu/programs/mba/management/",
  },
  {
    id: "marketing",
    name: "Marketing",
    credits: 5,
    groups: [
      ...MKTG_CORE,
      { label: "Marketing research (one of)", courses: MKTG_RESEARCH, minCredits: 1 },
      {
        label: "Marketing electives",
        courses: ["LGST 8050 / MKTG 7600"],
        departments: [{ department: "MKTG", minNumber: 7000 }],
        minCredits: 3,
      },
    ],
    cannotCombineWith: ["marketing-operations"],
    notes: [
      "Waived core credits must be replaced with other marketing courses.",
      "MKTG 9400/9410 or 9420/9430 (PhD, both halves) also satisfy the research requirement.",
      "Up to 1 CU combined of ASPs, Global Business Week, Global Modular Courses and independent study.",
      "Only one of MKTG 7700 and MKTG 7270 counts.",
    ],
    source: "https://marketing.wharton.upenn.edu/mba-program/marketing-management-major/",
  },
  {
    id: "marketing-operations",
    name: "Marketing & Operations Management",
    credits: 7,
    groups: [
      ...MKTG_CORE,
      { label: "OIDD flex core", courses: OIDD_FLEX_CORE, minCredits: 1, core: true },
      { label: "Marketing research (one of)", courses: MKTG_RESEARCH, minCredits: 1 },
      { label: "Marketing electives", departments: [{ department: "MKTG", minNumber: 7000 }], minCredits: 2 },
      { label: "OID electives", departments: [{ department: "OIDD" }], minCredits: 2 },
    ],
    cannotCombineWith: ["marketing", "oid"],
    notes: [
      "Electives total 5 CU: at least 2 from Marketing (including a research course) and 2 from OID.",
      "Waived core courses must be replaced with an elective from the same department.",
    ],
    source: "https://marketing.wharton.upenn.edu/mba-program/marketing-operations-management-major/",
  },
  {
    id: "multinational",
    name: "Multinational Management",
    credits: 4,
    groups: [
      {
        label: "Multinational management",
        courses: ["MGMT 7150", "MGMT 7200", "MGMT 8170", "MGMT 8710"],
        minCredits: 1.5,
      },
      {
        label: "International electives",
        courses: [
          "ACCT 7300",
          "BEPP 7880",
          "BEPP 7890",
          "BEPP 7980",
          "FNCE 7310",
          "FNCE 7320",
          "HCMG 8590",
          "HCMG 8680",
          "LGST 8020",
          "LGST 8200",
          "LGST 8300",
          "MGMT 7850 / BEPP 7850",
          "MGMT 7870",
          "MGMT 7880",
          "MGMT 8090",
          "MGMT 8750",
          "MKTG 7890",
          "OIDD 6730",
          "REAL 7050",
          "REAL 8210",
          "REAL 8900",
        ],
        minCredits: 0,
      },
    ],
    cannotCombineWith: [],
    notes: [
      "Only one of MGMT 7150 and MGMT 7200 may be taken.",
      "The international list is partial; other global courses may count with the advisor's approval.",
      "Up to 1 CU of Global Modular Courses.",
    ],
    source: "https://mgmt.wharton.upenn.edu/programs/mba/multinational-management/",
  },
  {
    id: "oid",
    name: "Operations, Information & Decisions",
    credits: 5,
    groups: [
      {
        label: "OID courses (including the flex core)",
        courses: [NEGOTIATIONS, "BEPP 8110"],
        departments: [{ department: "OIDD" }],
        minCredits: 5,
      },
    ],
    cannotCombineWith: ["marketing-operations"],
    notes: [
      "Cross-listed courses count.",
      "Up to 1 CU combined of independent study and Global Modular Courses.",
      "Suggested tracks: Operations Management, Information Systems, Decision Processes.",
    ],
    source: "https://oid.wharton.upenn.edu/programs/mba/operations-information-and-decisions/",
  },
  {
    id: "org-effectiveness",
    name: "Organizational Effectiveness",
    credits: 4,
    groups: [
      {
        label: "Organizational effectiveness",
        courses: [
          "MGMT 6240",
          "MGMT 6250",
          "MGMT 6710",
          NEGOTIATIONS,
          "MGMT 7280",
          "MGMT 7400",
          "MGMT 7430",
          "MGMT 7480",
          "MGMT 7510",
          "MGMT 7720",
          "MGMT 7730",
          "MGMT 7930 / OIDD 7930",
          "MGMT 7940",
          "MGMT 8160",
          "MGMT 8920",
        ],
        minCredits: 3,
      },
      {
        label: "Related (at most 1 CU)",
        courses: ["MGMT 6920 / LGST 6920 / OIDD 6920", "MGMT 7820", "MGMT 8020"],
        minCredits: 0,
        maxCredits: 1,
      },
    ],
    cannotCombineWith: [],
    notes: ["Relevant Global Modular Courses may count toward the 1 CU of related courses."],
    source: "https://mgmt.wharton.upenn.edu/programs/mba/organizational-effectiveness/",
  },
  {
    id: "quant-finance",
    name: "Quantitative Finance",
    credits: 6,
    groups: [
      FNCE_CORE,
      {
        label: "Quantitative finance",
        courses: [
          "FNCE 7050",
          "FNCE 7170",
          "FNCE 7190",
          "FNCE 7250",
          "FNCE 7370",
          "FNCE 7390",
          "FNCE 7570",
          "FNCE 8920",
        ],
        minCredits: 3,
      },
      {
        label: "Quantitative methods (at most 1 CU)",
        courses: ["FNCE 9210", "ACCT 7470", "OIDD 6530", "STAT 5330", "STAT 7110"],
        minCredits: 0,
        maxCredits: 1,
      },
    ],
    cannotCombineWith: ["finance"],
    notes: ["The 4 CU of electives must come from the two quantitative lists."],
    source: "https://fnce.wharton.upenn.edu/quantitative-finance-major/",
  },
  {
    id: "real-estate",
    name: "Real Estate",
    credits: 5,
    groups: [
      { label: "Required", courses: ["REAL 7210 / FNCE 7210", "REAL 8210"], minCredits: 2, required: true },
      {
        label: "Real estate electives",
        courses: [
          "REAL 7050",
          "REAL 7080 / BEPP 7080",
          "REAL 7240",
          "REAL 7300 / FNCE 7300 / BEPP 7730",
          "REAL 8040 / LGST 8040",
          "REAL 8360 / BEPP 8360",
          "REAL 8400",
          "REAL 8700",
          "REAL 8750",
          "REAL 8910",
        ],
        minCredits: 3,
      },
    ],
    cannotCombineWith: [],
    notes: ["REAL 7210 requires FNCE 6110 (or a waiver)."],
    source: "https://real-estate.wharton.upenn.edu/programs/mba/major/",
  },
  {
    id: "social-governance",
    name: "Social & Governance Factors for Business",
    credits: 4,
    groups: [
      { label: "Social & Governance", courses: SOCIAL_GOVERNANCE, minCredits: 3 },
      { label: "Environmental", courses: ENVIRONMENTAL, minCredits: 0, maxCredits: 1 },
    ],
    cannotCombineWith: ["ivsb"],
    notes: ESG_NOTES,
    source: "https://impact.wharton.upenn.edu/students/mba-major-social-and-governance-factors-for-business/",
  },
  {
    id: "statistics",
    name: "Statistics & Data Science",
    credits: 5,
    groups: [
      { label: "Statistics core", courses: ["STAT 6130", "STAT 6210"], minCredits: 1, core: true },
      {
        label: "Statistics electives",
        courses: [
          "STAT 7010",
          "STAT 7050",
          "STAT 7100",
          "STAT 7110",
          "STAT 7220",
          "STAT 7230",
          "STAT 7240",
          "STAT 7250",
          "STAT 7700",
          "STAT 7760 / MKTG 7760",
          "STAT 7770 / OIDD 7770",
          "STAT 9200",
        ],
        minCredits: 4,
      },
    ],
    cannotCombineWith: [],
    notes: [
      "Total is 5 CU: the STAT core (1) and 4 CU of electives.",
      "Some courses in other departments count with the advisor's permission.",
    ],
    source: "https://statistics.wharton.upenn.edu/programs/mba/course-requirements/",
  },
  {
    id: "strategic-management",
    name: "Strategic Management",
    credits: 4,
    groups: [
      {
        label: "Strategy",
        courses: ["MGMT 7010", "MGMT 7210", "MGMT 7230", "MGMT 7310", "MGMT 7820", "MGMT 8010", "MGMT 8710"],
        minCredits: 3,
      },
      {
        label: "Related (at most 1 CU)",
        courses: [
          "MGMT 7290 / LGST 7290",
          "LGST 8150",
          "MGMT 6250",
          "MGMT 7150",
          "MGMT 7200",
          "MGMT 7730",
          "MGMT 8020",
          "MGMT 8110",
          "MGMT 8140",
          "MGMT 8320",
          "MGMT 8920",
          "MKTG 7770",
          "OIDD 6360",
        ],
        minCredits: 0,
        maxCredits: 1,
      },
    ],
    cannotCombineWith: [],
    notes: ["Relevant Global Modular Courses may count toward the 1 CU of related courses."],
    source: "https://mgmt.wharton.upenn.edu/programs/mba/strategic-management/",
  },
];

/** Rules for students declaring more than one major (MBA Inside, majors page). */
export const MULTIPLE_MAJOR_RULES = [
  "At most 2.0 CU of approved cross-listed electives can count across all of a student's majors combined (core courses excluded).",
  "No course can count toward more than two majors.",
  "A course that fulfills a major's core requirement can't also count as an elective for that major.",
  "Courses taken pass/fail don't count toward any major.",
];

/** Whether a course code counts toward a group. */
export function groupIncludes(group: CourseGroup, code: string): boolean {
  if (group.courses?.some((entry) => courseCodes(entry).includes(code))) return true;
  const [department, numberText] = code.split(" ");
  const number = Number(numberText);
  return (group.departments ?? []).some(
    (d) => d.department === department && number >= (d.minNumber ?? 0) && !(d.exclude ?? []).includes(code),
  );
}

/** Whether a course counts toward a group under its code or any cross-listed code. */
export function groupIncludesCourse(group: CourseGroup, course: { code: string; crossListed: readonly string[] }): boolean {
  return groupIncludes(group, course.code) || course.crossListed.some((code) => groupIncludes(group, code));
}

/** Whether a course code counts toward a major. */
export function majorIncludes(major: Major, code: string): boolean {
  return major.groups.some((group) => groupIncludes(group, code));
}
