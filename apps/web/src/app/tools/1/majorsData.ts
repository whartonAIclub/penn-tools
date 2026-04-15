// Wharton MBA Major Requirements
// Fetched from https://mba.wharton.upenn.edu/mba-majors/ and each major's page
// courseIds match courseCatalog.ts format: no space, e.g. "FNCE6110"

export interface MajorReqGroup {
  label: string;
  cuNeeded: number;
  // "required-one": must complete one of the listed courses
  // "elective-pool": accumulate cuNeeded CU from the listed courses (+ optional catch-all)
  type: "required-one" | "elective-pool";
  courses: string[];
  catchAll?: {
    prefixes: string[];  // e.g. ["FNCE"] — any course starting with prefix
    minLevel: number;    // e.g. 7000 — course number must be >= this
  };
}

export interface MajorData {
  id: string;
  name: string;
  totalCURequired: number;
  sourceUrl: string;
  groups: MajorReqGroup[];
  notes?: string;
  unavailable?: boolean; // true if requirements couldn't be fetched
}

export const MAJORS: MajorData[] = [
  {
    id: "accounting",
    name: "Accounting",
    totalCURequired: 4.0,
    sourceUrl: "https://accounting.wharton.upenn.edu/programs/mba/acct-major/",
    groups: [
      {
        label: "Required: Problems in Financial Reporting",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["ACCT7420"],
      },
      {
        label: "Electives (3.0 CU from approved list)",
        cuNeeded: 3.0,
        type: "elective-pool",
        courses: ["ACCT7060", "ACCT7430", "ACCT7470", "ACCT7640", "ACCT7900", "ACCT7970", "FNCE7070"],
      },
    ],
    notes: "ACCT 6110/6130 are prerequisites and do not count toward the major.",
  },

  {
    id: "ai-for-business",
    name: "Artificial Intelligence for Business",
    totalCURequired: 4.0,
    sourceUrl: "https://oid.wharton.upenn.edu/artificial-intelligence-mba/",
    groups: [
      {
        label: "Required: Applied Machine Learning in Business",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["STAT7230"],
      },
      {
        label: "Required: Accountable AI (Ethics Pillar)",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["LGST6420"],
      },
      {
        label: "Foundations Elective — Pillar F (1.0 CU)",
        cuNeeded: 1.0,
        type: "elective-pool",
        courses: [
          "FNCE7370", "FNCE7800", "HCMG8530", "HCMG8570", "MKTG7120",
          "MKTG7370", "MKTG7680", "MKTG9560", "OIDD6620", "OIDD7770",
          "STAT7010", "STAT7730",
        ],
      },
      {
        label: "Impact & Ethics Elective — Pillar I (1.5 CU)",
        cuNeeded: 1.5,
        type: "elective-pool",
        courses: [
          "HCMG8580", "MGMT7310", "MGMT8020", "MKTG7270", "MKTG7340",
          "MKTG7790", "OIDD6130", "OIDD6670",
        ],
      },
    ],
  },

  {
    id: "business-analytics",
    name: "Business Analytics",
    totalCURequired: 4.0,
    sourceUrl: "https://mba-inside.wharton.upenn.edu/buan-major/",
    groups: [
      {
        label: "Required: Business Analytics",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["OIDD6120"],
      },
      {
        label: "Required: Operations/Strategy Course",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["OIDD6110", "OIDD6150"],
      },
      {
        label: "Analytics Electives (4.0 CU from approved list)",
        cuNeeded: 4.0,
        type: "elective-pool",
        courses: [
          "STAT7010", "STAT7050", "STAT7100", "STAT7110", "STAT7220",
          "STAT7230", "STAT7240", "STAT7250", "STAT7700", "STAT7760", "STAT7770",
          "OIDD6360", "OIDD6530", "OIDD6620", "OIDD6670", "OIDD7770",
          "MKTG7120", "MKTG7270", "MKTG7760", "MKTG9560",
          "FNCE7370", "FNCE7800",
          "ACCT7470", "HCMG8570",
        ],
        catchAll: { prefixes: ["STAT", "OIDD"], minLevel: 7000 },
      },
    ],
    notes: "Max 1 CU from independent study. Max 1 CU from non-Wharton courses.",
  },

  {
    id: "bepp",
    name: "Business Economics and Public Policy",
    totalCURequired: 4.0,
    sourceUrl: "https://bepp.wharton.upenn.edu/programs/mba/business-and-public-policy/",
    groups: [
      {
        label: "BEPP Electives (4.0 CU)",
        cuNeeded: 4.0,
        type: "elective-pool",
        courses: [
          "BEPP7040", "BEPP7100", "BEPP7610", "BEPP7630", "BEPP7700",
          "BEPP7720", "BEPP7730", "BEPP7890", "BEPP8050", "BEPP8110",
          "BEPP8120", "BEPP8230", "BEPP8240", "BEPP8530",
        ],
        catchAll: { prefixes: ["BEPP"], minLevel: 7000 },
      },
    ],
    notes: "One course may be substituted from another department (healthcare, energy, environment, taxation, or international finance) with approval.",
  },

  {
    id: "bees",
    name: "Business, Energy, Environment and Sustainability",
    totalCURequired: 4.0,
    sourceUrl: "https://impact.wharton.upenn.edu/students/mba-bees-major/",
    groups: [
      {
        label: "Environmental Courses (min 3.0 CU)",
        cuNeeded: 3.0,
        type: "elective-pool",
        courses: [
          "ACCT7640", "BEPP7610", "BEPP7630", "LGST8150",
          "LGST6470", "LGST7620", "MGMT7230", "OIDD5250",
        ],
      },
      {
        label: "Social & Governance Courses (up to 1.0 CU)",
        cuNeeded: 1.0,
        type: "elective-pool",
        courses: [
          "LGST6130", "LGST6420", "MGMT6240", "MGMT7720",
        ],
      },
    ],
    notes: "Up to 1.0 CU may come from pre-approved non-Wharton courses.",
  },

  {
    id: "entrepreneurship",
    name: "Entrepreneurship & Innovation",
    totalCURequired: 4.0,
    sourceUrl: "https://mgmt.wharton.upenn.edu/programs/mba/entrepreneurship-innovation/",
    groups: [
      {
        label: "Required: Entrepreneurship",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["MGMT8010"],
      },
      {
        label: "Electives (3.5 CU from approved list)",
        cuNeeded: 3.5,
        type: "elective-pool",
        courses: [
          "ACCT7900", "FNCE7500", "FNCE7510", "HCMG8670",
          "LGST8130", "LGST8060", "LGST6920",
          "MGMT7120", "MGMT7210", "MGMT7290", "MGMT7310", "MGMT8020",
          "MGMT8040", "MGMT8090", "MGMT8110", "MGMT8120", "MGMT8140",
          "MGMT8160", "MGMT8310", "MGMT8320", "MGMT8330", "MGMT8880",
          "MKTG7210", "MKTG7270", "MKTG7340", "MKTG7410",
          "OIDD5150", "OIDD6140", "OIDD6360", "OIDD6520", "OIDD6540",
          "OIDD6620", "OIDD6670", "REAL8910",
        ],
      },
    ],
  },

  {
    id: "esg",
    name: "Environmental, Social and Governance Factors for Business",
    totalCURequired: 4.0,
    sourceUrl: "https://impact.wharton.upenn.edu/students/esg-major/",
    groups: [],
    unavailable: true,
    notes: "Requirements page not available online. Please visit the department website.",
  },

  {
    id: "finance",
    name: "Finance",
    totalCURequired: 6.0,
    sourceUrl: "https://fnce.wharton.upenn.edu/course-requirements-finance-major/",
    groups: [
      {
        label: "Required: Corporate Finance",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["FNCE6110"],
      },
      {
        label: "Required: Macroeconomics",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["FNCE6130", "FNCE6230"],
      },
      {
        label: "Finance Electives (4.0 CU upper-level)",
        cuNeeded: 4.0,
        type: "elective-pool",
        courses: [
          "FNCE7050", "FNCE7070", "FNCE7130", "FNCE7150", "FNCE7170",
          "FNCE7190", "FNCE7210", "FNCE7230", "FNCE7250", "FNCE7290",
          "FNCE7310", "FNCE7320", "FNCE7370", "FNCE7380", "FNCE7390",
          "FNCE7400", "FNCE7500", "FNCE7510", "FNCE7570", "FNCE7800",
          "FNCE8920",
        ],
        catchAll: { prefixes: ["FNCE"], minLevel: 7000 },
      },
    ],
    notes: "Pass/fail courses do not count. Max 1 CU combined from global modular and independent study.",
  },

  {
    id: "hcm",
    name: "Health Care Management",
    totalCURequired: 5.0,
    sourceUrl: "https://hcmg.wharton.upenn.edu/programs/mba/hcmg-major-requirements/",
    groups: [
      {
        label: "Required: Introduction to Health Management",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["HCMG8410"],
      },
      {
        label: "Required: Health Care Field Application Project",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["HCMG6530"],
      },
      {
        label: "HCMG Electives (3.0 CU)",
        cuNeeded: 3.0,
        type: "elective-pool",
        courses: [
          "HCMG8450", "HCMG8480", "HCMG8500", "HCMG8520", "HCMG8530",
          "HCMG8550", "HCMG8570", "HCMG8580", "HCMG8590", "HCMG8600",
          "HCMG8630", "HCMG8660", "HCMG8670", "HCMG8680", "HCMG8700",
          "HCMG8740", "HCMG8770",
        ],
      },
    ],
  },

  {
    id: "lad",
    name: "Leading Across Differences",
    totalCURequired: 4.0,
    sourceUrl: "https://mgmt.wharton.upenn.edu/programs/mba/lad-major/",
    groups: [
      {
        label: "Required: Foundations of Teamwork & Leadership",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["MGMT6100"],
      },
      {
        label: "Required: Enterprise Management Course",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["MGMT6110", "MGMT6120", "MGMT6130"],
      },
      {
        label: "Foundational Courses (at least 1.5 CU)",
        cuNeeded: 1.5,
        type: "elective-pool",
        courses: [
          "BEPP7650", "LGST6420", "MGMT6240", "MGMT6710",
          "MGMT7280", "MGMT7720", "MGMT7940",
        ],
      },
      {
        label: "Additional Electives (up to 1.0 CU)",
        cuNeeded: 1.0,
        type: "elective-pool",
        courses: [
          "LGST8080", "MGMT6910", "MGMT7730", "MGMT7860",
          "MGMT7900", "MGMT7930", "OIDD6900", "OIDD6930",
        ],
      },
    ],
    notes: "Total 4.0 CU beyond the Wharton core.",
  },

  {
    id: "management",
    name: "Management",
    totalCURequired: 4.0,
    sourceUrl: "https://mgmt.wharton.upenn.edu/programs/mba/management/",
    groups: [
      {
        label: "Management Electives (4.0 CU)",
        cuNeeded: 4.0,
        type: "elective-pool",
        courses: [],
        catchAll: { prefixes: ["MGMT"], minLevel: 7000 },
      },
    ],
    notes: "Courses must be taken for a letter grade. Max 1 CU from global modular, ASP, or ISP.",
  },

  {
    id: "marketing",
    name: "Marketing",
    totalCURequired: 4.0,
    sourceUrl: "https://marketing.wharton.upenn.edu/mba-program/marketing-operations-management-major/",
    groups: [
      {
        label: "Required: Marketing Management",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["MKTG6110"],
      },
      {
        label: "Required: Marketing Strategy Course",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["MKTG6120", "MKTG6130"],
      },
      {
        label: "Marketing Electives (3.0 CU)",
        cuNeeded: 3.0,
        type: "elective-pool",
        courses: [],
        catchAll: { prefixes: ["MKTG"], minLevel: 7000 },
      },
    ],
    notes: "At least one data/analytics course required. See advisor for full approved list.",
  },

  {
    id: "maom",
    name: "Marketing and Operations Management (Joint Major)",
    totalCURequired: 7.0,
    sourceUrl: "https://marketing.wharton.upenn.edu/mba-program/marketing-operations-management-major/",
    groups: [
      {
        label: "Required: Marketing Management",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["MKTG6110"],
      },
      {
        label: "Required: Marketing Strategy Course",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["MKTG6120", "MKTG6130"],
      },
      {
        label: "Operations Core (1.0 CU from OIDD)",
        cuNeeded: 1.0,
        type: "elective-pool",
        courses: ["OIDD6110", "OIDD6120", "OIDD6130", "OIDD6140", "OIDD6150", "OIDD6620", "OIDD6900"],
      },
      {
        label: "Marketing Electives (at least 2.0 CU incl. 1 data course)",
        cuNeeded: 2.0,
        type: "elective-pool",
        courses: [],
        catchAll: { prefixes: ["MKTG"], minLevel: 7000 },
      },
      {
        label: "Operations/Decisions Electives (at least 2.0 CU)",
        cuNeeded: 2.0,
        type: "elective-pool",
        courses: [],
        catchAll: { prefixes: ["OIDD"], minLevel: 7000 },
      },
    ],
  },

  {
    id: "multinational",
    name: "Multinational Management",
    totalCURequired: 4.0,
    sourceUrl: "https://mgmt.wharton.upenn.edu/programs/mba/multinational-management/",
    groups: [
      {
        label: "Required: Foundations of Teamwork & Leadership",
        cuNeeded: 0.5,
        type: "required-one",
        courses: ["MGMT6100"],
      },
      {
        label: "Required: Enterprise Management Course",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["MGMT6110", "MGMT6120", "MGMT6130"],
      },
      {
        label: "Multinational Management Electives (min 1.5 CU)",
        cuNeeded: 1.5,
        type: "elective-pool",
        courses: ["MGMT7150", "MGMT7200", "MGMT8170", "MGMT8710"],
      },
      {
        label: "International Electives (1.5–2.5 CU)",
        cuNeeded: 1.5,
        type: "elective-pool",
        courses: [],
        catchAll: { prefixes: ["MGMT", "FNCE", "MKTG", "LGST"], minLevel: 7000 },
      },
    ],
    notes: "Only one of MGMT 7150 or MGMT 7200 may be counted. Max 1 CU from global modular courses.",
  },

  {
    id: "oid",
    name: "Operations, Information and Decisions",
    totalCURequired: 4.0,
    sourceUrl: "https://oid.wharton.upenn.edu/programs/mba/",
    groups: [
      {
        label: "OID Electives (4.0 CU)",
        cuNeeded: 4.0,
        type: "elective-pool",
        courses: [],
        catchAll: { prefixes: ["OIDD"], minLevel: 7000 },
      },
    ],
    unavailable: true,
    notes: "Full approved elective list not available online. Any upper-level OIDD course shown as a proxy — verify with department advisor.",
  },

  {
    id: "org-effectiveness",
    name: "Organizational Effectiveness",
    totalCURequired: 4.0,
    sourceUrl: "https://mgmt.wharton.upenn.edu/programs/mba/organizational-effectiveness/",
    groups: [
      {
        label: "Tier 1 Electives (at least 3.0 CU)",
        cuNeeded: 3.0,
        type: "elective-pool",
        courses: [
          "MGMT6240", "MGMT6250", "MGMT6710", "MGMT6910",
          "MGMT7280", "MGMT7430", "MGMT7480", "MGMT7510",
          "MGMT7720", "MGMT7730", "MGMT7930", "MGMT7940",
          "MGMT8160", "MGMT8920",
        ],
      },
      {
        label: "Tier 2 Electives (up to 1.0 CU)",
        cuNeeded: 1.0,
        type: "elective-pool",
        courses: ["MGMT6920", "MGMT7820", "MGMT8020"],
      },
    ],
    notes: "All courses must be taken for a letter grade.",
  },

  {
    id: "quant-finance",
    name: "Quantitative Finance",
    totalCURequired: 6.0,
    sourceUrl: "https://fnce.wharton.upenn.edu/quantitative-finance-major/",
    groups: [
      {
        label: "Required: Corporate Finance",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["FNCE6110"],
      },
      {
        label: "Required: Financial Economics / Macroeconomics",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["FNCE6130", "FNCE7190", "FNCE7320", "FNCE7400"],
      },
      {
        label: "Core QF Electives (at least 3.0 CU)",
        cuNeeded: 3.0,
        type: "elective-pool",
        courses: [
          "FNCE7050", "FNCE7170", "FNCE7190", "FNCE7250",
          "FNCE7370", "FNCE7390", "FNCE7570", "FNCE8920",
        ],
      },
      {
        label: "Additional Elective (1.0 CU from extended list)",
        cuNeeded: 1.0,
        type: "elective-pool",
        courses: [
          "FNCE9210", "ACCT7470", "OIDD6530", "STAT5330", "STAT7110",
          "FNCE7050", "FNCE7170", "FNCE7190", "FNCE7250",
          "FNCE7370", "FNCE7390", "FNCE7570", "FNCE8920",
        ],
      },
    ],
  },

  {
    id: "real-estate",
    name: "Real Estate",
    totalCURequired: 5.0,
    sourceUrl: "https://real-estate.wharton.upenn.edu/programs/mba/",
    groups: [
      {
        label: "Required: Real Estate Investment: Analysis and Financing",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["REAL7210", "FNCE7210"],
      },
      {
        label: "Required: Global Real Estate: Risk, Politics and Culture",
        cuNeeded: 1.0,
        type: "required-one",
        courses: ["REAL7050"],
      },
      {
        label: "Real Estate Electives (3.0 CU)",
        cuNeeded: 3.0,
        type: "elective-pool",
        courses: [
          "REAL7080", "REAL7240", "REAL7300", "REAL8360", "REAL8700",
          "REAL8040", "REAL8210", "REAL8400", "REAL8750", "REAL8910",
        ],
        catchAll: { prefixes: ["REAL"], minLevel: 7000 },
      },
    ],
  },

  {
    id: "social-governance",
    name: "Social and Governance Factors for Business",
    totalCURequired: 4.0,
    sourceUrl: "https://impact.wharton.upenn.edu/students/social-and-governance-major/",
    groups: [],
    unavailable: true,
    notes: "Requirements page not available online. Please visit the department website.",
  },

  {
    id: "stats-data-science",
    name: "Statistics and Data Science",
    totalCURequired: 4.0,
    sourceUrl: "https://statistics.wharton.upenn.edu/programs/mba/",
    groups: [
      {
        label: "Statistics Electives (4.0 CU)",
        cuNeeded: 4.0,
        type: "elective-pool",
        courses: [
          "STAT7010", "STAT7050", "STAT7100", "STAT7110", "STAT7220",
          "STAT7230", "STAT7240", "STAT7250", "STAT7700", "STAT7760",
          "STAT7770", "STAT9200",
        ],
        catchAll: { prefixes: ["STAT"], minLevel: 7000 },
      },
    ],
    notes: "Courses from other departments may be substituted with advisor approval. Pass/fail courses do not count.",
  },

  {
    id: "strategic-management",
    name: "Strategic Management",
    totalCURequired: 4.0,
    sourceUrl: "https://mgmt.wharton.upenn.edu/programs/mba/strategic-management/",
    groups: [
      {
        label: "Primary Electives (at least 3.0 CU)",
        cuNeeded: 3.0,
        type: "elective-pool",
        courses: [
          "MGMT7010", "MGMT7140", "MGMT7170", "MGMT7210", "MGMT7230",
          "MGMT7310", "MGMT7820", "MGMT8010", "MGMT8710",
        ],
      },
      {
        label: "Secondary Electives (up to 1.0 CU)",
        cuNeeded: 1.0,
        type: "elective-pool",
        courses: [
          "MGMT6250", "MGMT7150", "MGMT7200", "MGMT7290", "MGMT7730",
          "MGMT8020", "MGMT8110", "MGMT8140", "MGMT8320", "MGMT8920",
          "MKTG7770", "OIDD6360", "LGST8150",
        ],
      },
    ],
    notes: "All coursework must be taken for a letter grade.",
  },
];

export const MAJOR_MAP = new Map(MAJORS.map((m) => [m.id, m]));
