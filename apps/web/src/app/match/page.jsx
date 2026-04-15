"use client";

import React, { useMemo, useState } from "react";

const STARTUPS = [
  {
    startup_id: "S1",
    startup_name: "PulsePilot",
    founder_name: "Maya Chen",
    industry: "Healthtech",
    stage: "Seed",
    location: "New York",
    team_size: 6,
    role_openings: ["Product", "Data", "Growth"],
    skills_needed: ["python", "sql", "product thinking", "experimentation", "analytics"],
    mission_keywords: ["health", "patients", "care delivery", "access"],
    work_style: ["fast-paced", "ownership", "ambiguity"],
    min_commitment_hours: 10,
    paid: true,
    blurb: "Building workflow software that helps care teams reduce patient drop-off.",
  },
  {
    startup_id: "S2",
    startup_name: "CarbonCart",
    founder_name: "Leo Martinez",
    industry: "Climate",
    stage: "Pre-Seed",
    location: "Remote",
    team_size: 4,
    role_openings: ["Software", "Operations", "Design"],
    skills_needed: ["react", "figma", "user research", "javascript", "operations"],
    mission_keywords: ["climate", "supply chain", "sustainability", "carbon"],
    work_style: ["collaborative", "scrappy", "creative"],
    min_commitment_hours: 8,
    paid: false,
    blurb: "Helping consumer brands reduce supply-chain emissions with practical software.",
  },
  {
    startup_id: "S3",
    startup_name: "FinPath",
    founder_name: "Ari Patel",
    industry: "Fintech",
    stage: "Series A",
    location: "San Francisco",
    team_size: 18,
    role_openings: ["Product", "Software", "Business Ops"],
    skills_needed: ["python", "excel", "sql", "finance", "roadmapping"],
    mission_keywords: ["financial literacy", "students", "banking", "credit"],
    work_style: ["analytical", "ownership", "structured"],
    min_commitment_hours: 12,
    paid: true,
    blurb: "Building tools that help Gen Z users make better financial decisions.",
  },
];

const STUDENTS = [
  {
    student_id: "T1",
    name: "Nina Kapoor",
    school: "UPenn",
    year: "Master's",
    location: "Philadelphia",
    preferred_roles: ["Product", "Data"],
    skills: ["python", "sql", "product thinking", "analytics", "tableau"],
    interests: ["health", "fintech", "education"],
    work_style: ["ownership", "structured", "fast-paced"],
    weekly_hours: 12,
    wants_paid: true,
    mission_statement: "I like using data to build products with real-world impact.",
    experience_level: "Intermediate",
  },
  {
    student_id: "T2",
    name: "Omar Hassan",
    school: "NYU",
    year: "Junior",
    location: "New York",
    preferred_roles: ["Software", "Design"],
    skills: ["react", "javascript", "figma", "user research", "css"],
    interests: ["climate", "consumer", "design"],
    work_style: ["creative", "collaborative", "scrappy"],
    weekly_hours: 10,
    wants_paid: false,
    mission_statement: "I want to help early teams build products people genuinely love.",
    experience_level: "Intermediate",
  },
  {
    student_id: "T3",
    name: "Sophia Reed",
    school: "Berkeley",
    year: "Senior",
    location: "San Francisco",
    preferred_roles: ["Business Ops", "Product"],
    skills: ["excel", "sql", "finance", "roadmapping", "market research"],
    interests: ["fintech", "credit", "students"],
    work_style: ["analytical", "ownership", "structured"],
    weekly_hours: 15,
    wants_paid: true,
    mission_statement: "I care about expanding access to financial tools for younger users.",
    experience_level: "Advanced",
  },
  {
    student_id: "T4",
    name: "Daniel Kim",
    school: "Columbia",
    year: "Sophomore",
    location: "Remote",
    preferred_roles: ["Growth", "Operations"],
    skills: ["analytics", "experimentation", "excel", "growth marketing", "operations"],
    interests: ["health", "climate", "consumer"],
    work_style: ["fast-paced", "scrappy", "ownership"],
    weekly_hours: 8,
    wants_paid: true,
    mission_statement: "I want to learn by doing and help young startups grow.",
    experience_level: "Beginner",
  },
];

function normalizeTokenList(items) {
  const cleaned = items
    .map((item) => item.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

function overlapScore(a, b) {
  const aSet = new Set(normalizeTokenList(a));
  const bSet = new Set(normalizeTokenList(b));
  if (!aSet.size || !bSet.size) return 0;
  const intersection = [...aSet].filter((x) => bSet.has(x)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return intersection / union;
}

function containsAny(source, targets) {
  const s = new Set(normalizeTokenList(source));
  const t = new Set(normalizeTokenList(targets));
  if (!t.size) return 0;
  const overlap = [...s].filter((x) => t.has(x)).length;
  return overlap / Math.max(t.size, 1);
}

function locationScore(studentLoc, startupLoc) {
  const s = studentLoc.trim().toLowerCase();
  const t = startupLoc.trim().toLowerCase();
  if (t === "remote") return 1;
  if (s === t) return 1;
  if (s === "remote") return 0.8;
  return 0.3;
}

function compensationScore(studentWantsPaid, startupPaid) {
  if (studentWantsPaid && startupPaid) return 1;
  if (studentWantsPaid && !startupPaid) return 0;
  if (!studentWantsPaid && startupPaid) return 0.9;
  return 0.8;
}

function commitmentScore(studentHours, startupMinHours) {
  if (studentHours >= startupMinHours) return 1;
  const gap = startupMinHours - studentHours;
  return Math.max(0, 1 - gap / Math.max(startupMinHours, 1));
}

function experienceScore(level) {
  const mapping = {
    Beginner: 0.55,
    Intermediate: 0.78,
    Advanced: 1,
  };
  return mapping[level] ?? 0.7;
}

function startupToStudentScore(startup, student) {
  const components = {
    role_fit: containsAny(student.preferred_roles, startup.role_openings),
    skill_fit: containsAny(student.skills, startup.skills_needed),
    mission_fit: overlapScore(student.interests, startup.mission_keywords),
    style_fit: overlapScore(student.work_style, startup.work_style),
    commit_fit: commitmentScore(student.weekly_hours, startup.min_commitment_hours),
    pay_fit: compensationScore(student.wants_paid, startup.paid),
    loc_fit: locationScore(student.location, startup.location),
    exp_fit: experienceScore(student.experience_level),
  };

  const weights = {
    role_fit: 0.2,
    skill_fit: 0.28,
    mission_fit: 0.13,
    style_fit: 0.12,
    commit_fit: 0.1,
    pay_fit: 0.07,
    loc_fit: 0.05,
    exp_fit: 0.05,
  };

  const total = Object.keys(weights).reduce((sum, key) => sum + weights[key] * components[key], 0);
  return { total: Number(total.toFixed(4)), components };
}

function studentToStartupScore(student, startup) {
  const components = {
    role_fit: containsAny(startup.role_openings, student.preferred_roles),
    skill_fit: containsAny(startup.skills_needed, student.skills),
    mission_fit: overlapScore(student.interests, startup.mission_keywords),
    style_fit: overlapScore(student.work_style, startup.work_style),
    commit_fit: commitmentScore(student.weekly_hours, startup.min_commitment_hours),
    pay_fit: compensationScore(student.wants_paid, startup.paid),
    loc_fit: locationScore(student.location, startup.location),
    stage_fit: ["Seed", "Series A"].includes(startup.stage) ? 1 : 0.8,
  };

  const weights = {
    role_fit: 0.22,
    skill_fit: 0.22,
    mission_fit: 0.16,
    style_fit: 0.12,
    commit_fit: 0.08,
    pay_fit: 0.1,
    loc_fit: 0.05,
    stage_fit: 0.05,
  };

  const total = Object.keys(weights).reduce((sum, key) => sum + weights[key] * components[key], 0);
  return { total: Number(total.toFixed(4)), components };
}

function explainMatch(startup, student) {
  const sharedSkills = normalizeTokenList(student.skills).filter((x) => normalizeTokenList(startup.skills_needed).includes(x));
  const sharedRoles = normalizeTokenList(student.preferred_roles).filter((x) => normalizeTokenList(startup.role_openings).includes(x));
  const sharedValues = normalizeTokenList(student.interests).filter((x) => normalizeTokenList(startup.mission_keywords).includes(x));
  const sharedStyle = normalizeTokenList(student.work_style).filter((x) => normalizeTokenList(startup.work_style).includes(x));

  const reasons = [];
  if (sharedRoles.length) reasons.push(`strong role alignment: ${sharedRoles.slice(0, 3).join(", ")}`);
  if (sharedSkills.length) reasons.push(`relevant skills overlap: ${sharedSkills.slice(0, 4).join(", ")}`);
  if (sharedValues.length) reasons.push(`mission overlap around ${sharedValues.slice(0, 3).join(", ")}`);
  if (sharedStyle.length) reasons.push(`compatible work style: ${sharedStyle.slice(0, 3).join(", ")}`);
  if (student.weekly_hours >= startup.min_commitment_hours) reasons.push("student meets the weekly commitment");
  if (startup.paid && student.wants_paid) reasons.push("compensation preferences align");
  if (startup.location.toLowerCase() === "remote" || student.location.toLowerCase() === startup.location.toLowerCase()) {
    reasons.push("location setup works well");
  }
  if (!reasons.length) reasons.push("overall profile similarity is above threshold");
  return `${student.name} matches with ${startup.startup_name} because of ${reasons.slice(0, 5).join("; ")}.`;
}

function buildPreferenceRankings(startups, students) {
  const startupPref = {};
  const studentPref = {};
  const pairScores = [];

  startups.forEach((startup) => {
    const scoredStudents = students.map((student) => {
      const startupScore = startupToStudentScore(startup, student).total;
      const studentScore = studentToStartupScore(student, startup).total;
      const mutualScore = Number((0.5 * startupScore + 0.5 * studentScore).toFixed(4));
      pairScores.push({
        startup_id: startup.startup_id,
        startup_name: startup.startup_name,
        student_id: student.student_id,
        student_name: student.name,
        startup_score: startupScore,
        student_score: studentScore,
        mutual_score: mutualScore,
        explanation: explainMatch(startup, student),
      });
      return [student.student_id, mutualScore];
    });

    scoredStudents.sort((a, b) => b[1] - a[1]);
    startupPref[startup.startup_id] = scoredStudents.map(([id]) => id);
  });

  students.forEach((student) => {
    const scoredStartups = startups.map((startup) => {
      const startupScore = startupToStudentScore(startup, student).total;
      const studentScore = studentToStartupScore(student, startup).total;
      const mutualScore = Number((0.5 * startupScore + 0.5 * studentScore).toFixed(4));
      return [startup.startup_id, mutualScore];
    });

    scoredStartups.sort((a, b) => b[1] - a[1]);
    studentPref[student.student_id] = scoredStartups.map(([id]) => id);
  });

  return { startupPref, studentPref, pairScores };
}

function stableMatch(startupPref, studentPref) {
  const freeStartups = [...Object.keys(startupPref)];
  const proposals = Object.fromEntries(Object.keys(startupPref).map((s) => [s, []]));
  const studentMatch = {};

  const studentRank = {};
  Object.entries(studentPref).forEach(([studentId, prefs]) => {
    studentRank[studentId] = Object.fromEntries(prefs.map((startupId, rank) => [startupId, rank]));
  });

  while (freeStartups.length) {
    const startup = freeStartups.shift();
    const prefs = startupPref[startup] || [];

    let nextStudent = null;
    for (const student of prefs) {
      if (!proposals[startup].includes(student)) {
        nextStudent = student;
        proposals[startup].push(student);
        break;
      }
    }

    if (!nextStudent) continue;

    if (!studentMatch[nextStudent]) {
      studentMatch[nextStudent] = startup;
    } else {
      const currentStartup = studentMatch[nextStudent];
      if (studentRank[nextStudent][startup] < studentRank[nextStudent][currentStartup]) {
        studentMatch[nextStudent] = startup;
        freeStartups.push(currentStartup);
      } else {
        freeStartups.push(startup);
      }
    }
  }

  return Object.fromEntries(Object.entries(studentMatch).map(([studentId, startupId]) => [startupId, studentId]));
}

function parseCommaSeparated(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function InfoCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function Pill({ children }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{children}</span>;
}

export default function FounderStudentMatchPage() {
  const [page, setPage] = useState("Overview");
  const [startups, setStartups] = useState(STARTUPS);
  const [students, setStudents] = useState(STUDENTS);
  const [sortCol, setSortCol] = useState("mutual_score");
  const [selectedPairIndex, setSelectedPairIndex] = useState(0);

  const [startupForm, setStartupForm] = useState({
    startup_name: "",
    founder_name: "",
    industry: "",
    stage: "Seed",
    location: "",
    team_size: 5,
    role_openings: "",
    skills_needed: "",
    mission_keywords: "",
    work_style: "",
    min_commitment_hours: 10,
    paid: true,
    blurb: "",
  });

  const [studentForm, setStudentForm] = useState({
    name: "",
    school: "",
    year: "Master's",
    location: "",
    preferred_roles: "",
    skills: "",
    interests: "",
    work_style: "",
    weekly_hours: 10,
    wants_paid: true,
    mission_statement: "",
    experience_level: "Intermediate",
  });

  const { startupPref, studentPref, pairScores } = useMemo(() => buildPreferenceRankings(startups, students), [startups, students]);

  const filteredScores = useMemo(() => {
    return [...pairScores].sort((a, b) => b[sortCol] - a[sortCol]);
  }, [pairScores, sortCol]);

  const matches = useMemo(() => stableMatch(startupPref, studentPref), [startupPref, studentPref]);

  const startupLookup = useMemo(() => Object.fromEntries(startups.map((s) => [s.startup_id, s])), [startups]);
  const studentLookup = useMemo(() => Object.fromEntries(students.map((s) => [s.student_id, s])), [students]);

  const resultsRows = useMemo(() => {
    return Object.entries(matches)
      .map(([startupId, studentId]) => {
        const startup = startupLookup[startupId];
        const student = studentLookup[studentId];
        const scoreRow = pairScores.find((row) => row.startup_id === startupId && row.student_id === studentId);
        return {
          startup: startup?.startup_name,
          founder: startup?.founder_name,
          student: student?.name,
          school: student?.school,
          mutual_score: scoreRow?.mutual_score ?? 0,
          why: scoreRow?.explanation ?? "",
        };
      })
      .sort((a, b) => b.mutual_score - a.mutual_score);
  }, [matches, startupLookup, studentLookup, pairScores]);

  const navItems = ["Overview", "Add Startup", "Add Student", "Profiles", "Match Insights", "Final Matches"];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 p-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:h-fit">
          <div className="mb-6">
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Match Platform</div>
            <h1 className="mt-1 text-xl font-semibold">Startup ↔ Student</h1>
          </div>
          <div className="space-y-2">
            {navItems.map((item) => (
              <button
                key={item}
                onClick={() => setPage(item)}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                  page === item ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-6">
          {page === "Overview" && (
            <>
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h2 className="text-3xl font-semibold">Startup Talent Match Platform</h2>
                <p className="mt-2 text-slate-600">
                  Connecting high-potential students with early-stage startups — fast.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <InfoCard title="Startups">
                  <div className="text-3xl font-semibold">{startups.length}</div>
                </InfoCard>
                <InfoCard title="Students">
                  <div className="text-3xl font-semibold">{students.length}</div>
                </InfoCard>
                <InfoCard title="Matches Evaluated">
                  <div className="text-3xl font-semibold">{startups.length * students.length}</div>
                </InfoCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <InfoCard title="How it works">
                  <ol className="list-decimal space-y-2 pl-5 text-slate-700">
                    <li>Startups define roles, skills, and team needs.</li>
                    <li>Students submit experience, interests, and preferences.</li>
                    <li>The system evaluates compatibility across multiple dimensions.</li>
                    <li>A stable matching algorithm assigns optimal pairings.</li>
                    <li>Each match includes a clear explanation of fit.</li>
                  </ol>
                </InfoCard>
                <InfoCard title="Why this matters">
                  <p className="text-slate-700">
                    Early-stage startups need the right people fast, and students want meaningful, high-impact experiences.
                    This system helps both sides find strong matches efficiently and transparently.
                  </p>
                </InfoCard>
              </div>
            </>
          )}

          {page === "Add Startup" && (
            <InfoCard title="Add Startup / Founder">
              <div className="grid gap-4 md:grid-cols-2">
                <input className="rounded-xl border p-3" placeholder="Startup name" value={startupForm.startup_name} onChange={(e) => setStartupForm({ ...startupForm, startup_name: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Founder name" value={startupForm.founder_name} onChange={(e) => setStartupForm({ ...startupForm, founder_name: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Industry" value={startupForm.industry} onChange={(e) => setStartupForm({ ...startupForm, industry: e.target.value })} />
                <select className="rounded-xl border p-3" value={startupForm.stage} onChange={(e) => setStartupForm({ ...startupForm, stage: e.target.value })}>
                  {['Pre-Seed', 'Seed', 'Series A', 'Series B+'].map((stage) => <option key={stage}>{stage}</option>)}
                </select>
                <input className="rounded-xl border p-3" placeholder="Location" value={startupForm.location} onChange={(e) => setStartupForm({ ...startupForm, location: e.target.value })} />
                <input className="rounded-xl border p-3" type="number" placeholder="Team size" value={startupForm.team_size} onChange={(e) => setStartupForm({ ...startupForm, team_size: Number(e.target.value) })} />
                <input className="rounded-xl border p-3" placeholder="Role openings (comma-separated)" value={startupForm.role_openings} onChange={(e) => setStartupForm({ ...startupForm, role_openings: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Skills needed (comma-separated)" value={startupForm.skills_needed} onChange={(e) => setStartupForm({ ...startupForm, skills_needed: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Mission keywords (comma-separated)" value={startupForm.mission_keywords} onChange={(e) => setStartupForm({ ...startupForm, mission_keywords: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Work style (comma-separated)" value={startupForm.work_style} onChange={(e) => setStartupForm({ ...startupForm, work_style: e.target.value })} />
                <input className="rounded-xl border p-3" type="number" placeholder="Minimum weekly hours" value={startupForm.min_commitment_hours} onChange={(e) => setStartupForm({ ...startupForm, min_commitment_hours: Number(e.target.value) })} />
                <label className="flex items-center gap-2 rounded-xl border p-3"><input type="checkbox" checked={startupForm.paid} onChange={(e) => setStartupForm({ ...startupForm, paid: e.target.checked })} /> Paid opportunity</label>
              </div>
              <textarea className="mt-4 min-h-28 w-full rounded-xl border p-3" placeholder="Short startup blurb" value={startupForm.blurb} onChange={(e) => setStartupForm({ ...startupForm, blurb: e.target.value })} />
              <button
                className="mt-4 rounded-2xl bg-slate-900 px-5 py-3 text-white"
                onClick={() => {
                  const newId = `S${startups.length + 1}`;
                  setStartups([
                    ...startups,
                    {
                      startup_id: newId,
                      startup_name: startupForm.startup_name,
                      founder_name: startupForm.founder_name,
                      industry: startupForm.industry,
                      stage: startupForm.stage,
                      location: startupForm.location,
                      team_size: Number(startupForm.team_size),
                      role_openings: parseCommaSeparated(startupForm.role_openings),
                      skills_needed: parseCommaSeparated(startupForm.skills_needed),
                      mission_keywords: parseCommaSeparated(startupForm.mission_keywords),
                      work_style: parseCommaSeparated(startupForm.work_style),
                      min_commitment_hours: Number(startupForm.min_commitment_hours),
                      paid: startupForm.paid,
                      blurb: startupForm.blurb,
                    },
                  ]);
                }}
              >
                Add startup
              </button>
            </InfoCard>
          )}

          {page === "Add Student" && (
            <InfoCard title="Add Student">
              <div className="grid gap-4 md:grid-cols-2">
                <input className="rounded-xl border p-3" placeholder="Student name" value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="School" value={studentForm.school} onChange={(e) => setStudentForm({ ...studentForm, school: e.target.value })} />
                <select className="rounded-xl border p-3" value={studentForm.year} onChange={(e) => setStudentForm({ ...studentForm, year: e.target.value })}>
                  {['Freshman', 'Sophomore', 'Junior', 'Senior', "Master's", 'MBA', 'PhD'].map((year) => <option key={year}>{year}</option>)}
                </select>
                <input className="rounded-xl border p-3" placeholder="Location" value={studentForm.location} onChange={(e) => setStudentForm({ ...studentForm, location: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Preferred roles (comma-separated)" value={studentForm.preferred_roles} onChange={(e) => setStudentForm({ ...studentForm, preferred_roles: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Skills (comma-separated)" value={studentForm.skills} onChange={(e) => setStudentForm({ ...studentForm, skills: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Mission / industry interests (comma-separated)" value={studentForm.interests} onChange={(e) => setStudentForm({ ...studentForm, interests: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Work style (comma-separated)" value={studentForm.work_style} onChange={(e) => setStudentForm({ ...studentForm, work_style: e.target.value })} />
                <input className="rounded-xl border p-3" type="number" placeholder="Available weekly hours" value={studentForm.weekly_hours} onChange={(e) => setStudentForm({ ...studentForm, weekly_hours: Number(e.target.value) })} />
                <select className="rounded-xl border p-3" value={studentForm.experience_level} onChange={(e) => setStudentForm({ ...studentForm, experience_level: e.target.value })}>
                  {['Beginner', 'Intermediate', 'Advanced'].map((level) => <option key={level}>{level}</option>)}
                </select>
                <label className="flex items-center gap-2 rounded-xl border p-3"><input type="checkbox" checked={studentForm.wants_paid} onChange={(e) => setStudentForm({ ...studentForm, wants_paid: e.target.checked })} /> Needs paid opportunity</label>
              </div>
              <textarea className="mt-4 min-h-28 w-full rounded-xl border p-3" placeholder="Why this student wants a startup role" value={studentForm.mission_statement} onChange={(e) => setStudentForm({ ...studentForm, mission_statement: e.target.value })} />
              <button
                className="mt-4 rounded-2xl bg-slate-900 px-5 py-3 text-white"
                onClick={() => {
                  const newId = `T${students.length + 1}`;
                  setStudents([
                    ...students,
                    {
                      student_id: newId,
                      name: studentForm.name,
                      school: studentForm.school,
                      year: studentForm.year,
                      location: studentForm.location,
                      preferred_roles: parseCommaSeparated(studentForm.preferred_roles),
                      skills: parseCommaSeparated(studentForm.skills),
                      interests: parseCommaSeparated(studentForm.interests),
                      work_style: parseCommaSeparated(studentForm.work_style),
                      weekly_hours: Number(studentForm.weekly_hours),
                      wants_paid: studentForm.wants_paid,
                      mission_statement: studentForm.mission_statement,
                      experience_level: studentForm.experience_level,
                    },
                  ]);
                }}
              >
                Add student
              </button>
            </InfoCard>
          )}

          {page === "Profiles" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <InfoCard title="Startups">
                <div className="space-y-4">
                  {startups.map((startup) => (
                    <div key={startup.startup_id} className="rounded-2xl border p-4">
                      <div className="text-lg font-semibold">{startup.startup_name} · {startup.founder_name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Pill>{startup.industry}</Pill>
                        <Pill>{startup.stage}</Pill>
                        <Pill>{startup.location}</Pill>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{startup.blurb}</p>
                    </div>
                  ))}
                </div>
              </InfoCard>
              <InfoCard title="Students">
                <div className="space-y-4">
                  {students.map((student) => (
                    <div key={student.student_id} className="rounded-2xl border p-4">
                      <div className="text-lg font-semibold">{student.name} · {student.school}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Pill>{student.year}</Pill>
                        <Pill>{student.location}</Pill>
                        <Pill>{student.experience_level}</Pill>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{student.mission_statement}</p>
                    </div>
                  ))}
                </div>
              </InfoCard>
            </div>
          )}

          {page === "Match Insights" && (
            <InfoCard title="Pairwise Match Scores">
              <div className="mb-4 flex items-center gap-3">
                <label className="text-sm text-slate-600">Sort by</label>
                <select className="rounded-xl border p-2" value={sortCol} onChange={(e) => setSortCol(e.target.value)}>
                  <option value="mutual_score">mutual_score</option>
                  <option value="startup_score">startup_score</option>
                  <option value="student_score">student_score</option>
                </select>
              </div>

              <div className="overflow-x-auto rounded-2xl border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-3">Startup</th>
                      <th className="p-3">Student</th>
                      <th className="p-3">Startup Score</th>
                      <th className="p-3">Student Score</th>
                      <th className="p-3">Mutual Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScores.map((row, idx) => (
                      <tr key={`${row.startup_id}-${row.student_id}`} className="border-t hover:bg-slate-50">
                        <td className="p-3">{row.startup_name}</td>
                        <td className="p-3">{row.student_name}</td>
                        <td className="p-3">{row.startup_score}</td>
                        <td className="p-3">{row.student_score}</td>
                        <td className="p-3">
                          <button className="rounded-lg bg-slate-900 px-3 py-1 text-white" onClick={() => setSelectedPairIndex(idx)}>
                            {row.mutual_score}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredScores[selectedPairIndex] && (
                <div className="mt-4 rounded-2xl bg-slate-100 p-4">
                  <div className="font-semibold">Inspect pairing</div>
                  <div className="mt-1 text-sm text-slate-700">
                    {filteredScores[selectedPairIndex].startup_name} ↔ {filteredScores[selectedPairIndex].student_name}
                  </div>
                  <div className="mt-2 text-sm">Mutual score: {filteredScores[selectedPairIndex].mutual_score}</div>
                  <p className="mt-2 text-sm text-slate-700">{filteredScores[selectedPairIndex].explanation}</p>
                </div>
              )}
            </InfoCard>
          )}

          {page === "Final Matches" && (
            <InfoCard title="Stable Match Results">
              {!resultsRows.length ? (
                <p className="text-slate-600">No stable matches found yet.</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-2xl border">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="p-3">Startup</th>
                          <th className="p-3">Founder</th>
                          <th className="p-3">Student</th>
                          <th className="p-3">School</th>
                          <th className="p-3">Mutual Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultsRows.map((row) => (
                          <tr key={`${row.startup}-${row.student}`} className="border-t">
                            <td className="p-3">{row.startup}</td>
                            <td className="p-3">{row.founder}</td>
                            <td className="p-3">{row.student}</td>
                            <td className="p-3">{row.school}</td>
                            <td className="p-3">{row.mutual_score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-4">
                    {resultsRows.map((row) => (
                      <div key={`${row.startup}-${row.student}-narrative`} className="rounded-2xl border p-4">
                        <h3 className="text-xl font-semibold">{row.startup} ↔ {row.student}</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Founder: {row.founder} | School: {row.school} | Mutual score: {row.mutual_score}
                        </p>
                        <p className="mt-3 text-sm text-slate-700">{row.why}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </InfoCard>
          )}
        </main>
      </div>
    </div>
  );
}
