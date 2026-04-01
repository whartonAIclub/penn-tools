import streamlit as st
import pandas as pd
import numpy as np
from dataclasses import dataclass, asdict
from typing import List, Dict, Tuple
import re

st.set_page_config(page_title="Founder x Student Match", layout="wide")

# =========================================================
# Founder x Student Match Prototype
# ---------------------------------------------------------
# A single-file Streamlit prototype for matching startup
# founders with students, inspired by residency/match systems.
#
# Run locally:
#   pip install streamlit pandas numpy
#   streamlit run startup_student_match_prototype.py
#
# This prototype includes:
# 1) Startup / founder profile creation
# 2) Student profile creation
# 3) Mutual preference ranking
# 4) AI-ish scoring using interpretable weighted matching
# 5) Stable matching (Gale-Shapley style)
# 6) Explainability for each match
#
# Optional next step:
# Replace the scoring function with embeddings / LLM calls.
# =========================================================

# -----------------------------
# Sample data
# -----------------------------
STARTUPS = [
    {
        "startup_id": "S1",
        "startup_name": "PulsePilot",
        "founder_name": "Maya Chen",
        "industry": "Healthtech",
        "stage": "Seed",
        "location": "New York",
        "team_size": 6,
        "role_openings": ["Product", "Data", "Growth"],
        "skills_needed": ["python", "sql", "product thinking", "experimentation", "analytics"],
        "mission_keywords": ["health", "patients", "care delivery", "access"],
        "work_style": ["fast-paced", "ownership", "ambiguity"],
        "min_commitment_hours": 10,
        "paid": True,
        "blurb": "Building workflow software that helps care teams reduce patient drop-off."
    },
    {
        "startup_id": "S2",
        "startup_name": "CarbonCart",
        "founder_name": "Leo Martinez",
        "industry": "Climate",
        "stage": "Pre-Seed",
        "location": "Remote",
        "team_size": 4,
        "role_openings": ["Software", "Operations", "Design"],
        "skills_needed": ["react", "figma", "user research", "javascript", "operations"],
        "mission_keywords": ["climate", "supply chain", "sustainability", "carbon"],
        "work_style": ["collaborative", "scrappy", "creative"],
        "min_commitment_hours": 8,
        "paid": False,
        "blurb": "Helping consumer brands reduce supply-chain emissions with practical software."
    },
    {
        "startup_id": "S3",
        "startup_name": "FinPath",
        "founder_name": "Ari Patel",
        "industry": "Fintech",
        "stage": "Series A",
        "location": "San Francisco",
        "team_size": 18,
        "role_openings": ["Product", "Software", "Business Ops"],
        "skills_needed": ["python", "excel", "sql", "finance", "roadmapping"],
        "mission_keywords": ["financial literacy", "students", "banking", "credit"],
        "work_style": ["analytical", "ownership", "structured"],
        "min_commitment_hours": 12,
        "paid": True,
        "blurb": "Building tools that help Gen Z users make better financial decisions."
    },
]

STUDENTS = [
    {
        "student_id": "T1",
        "name": "Nina Kapoor",
        "school": "UPenn",
        "year": "Master's",
        "location": "Philadelphia",
        "preferred_roles": ["Product", "Data"],
        "skills": ["python", "sql", "product thinking", "analytics", "tableau"],
        "interests": ["health", "fintech", "education"],
        "work_style": ["ownership", "structured", "fast-paced"],
        "weekly_hours": 12,
        "wants_paid": True,
        "mission_statement": "I like using data to build products with real-world impact.",
        "experience_level": "Intermediate"
    },
    {
        "student_id": "T2",
        "name": "Omar Hassan",
        "school": "NYU",
        "year": "Junior",
        "location": "New York",
        "preferred_roles": ["Software", "Design"],
        "skills": ["react", "javascript", "figma", "user research", "css"],
        "interests": ["climate", "consumer", "design"],
        "work_style": ["creative", "collaborative", "scrappy"],
        "weekly_hours": 10,
        "wants_paid": False,
        "mission_statement": "I want to help early teams build products people genuinely love.",
        "experience_level": "Intermediate"
    },
    {
        "student_id": "T3",
        "name": "Sophia Reed",
        "school": "Berkeley",
        "year": "Senior",
        "location": "San Francisco",
        "preferred_roles": ["Business Ops", "Product"],
        "skills": ["excel", "sql", "finance", "roadmapping", "market research"],
        "interests": ["fintech", "credit", "students"],
        "work_style": ["analytical", "ownership", "structured"],
        "weekly_hours": 15,
        "wants_paid": True,
        "mission_statement": "I care about expanding access to financial tools for younger users.",
        "experience_level": "Advanced"
    },
    {
        "student_id": "T4",
        "name": "Daniel Kim",
        "school": "Columbia",
        "year": "Sophomore",
        "location": "Remote",
        "preferred_roles": ["Growth", "Operations"],
        "skills": ["analytics", "experimentation", "excel", "growth marketing", "operations"],
        "interests": ["health", "climate", "consumer"],
        "work_style": ["fast-paced", "scrappy", "ownership"],
        "weekly_hours": 8,
        "wants_paid": True,
        "mission_statement": "I want to learn by doing and help young startups grow.",
        "experience_level": "Beginner"
    },
]

# -----------------------------
# Helpers
# -----------------------------
def normalize_token_list(items: List[str]) -> List[str]:
    cleaned = []
    for item in items:
        token = re.sub(r"\s+", " ", item.strip().lower())
        if token:
            cleaned.append(token)
    return list(dict.fromkeys(cleaned))


def overlap_score(a: List[str], b: List[str]) -> float:
    a_set, b_set = set(normalize_token_list(a)), set(normalize_token_list(b))
    if not a_set or not b_set:
        return 0.0
    return len(a_set & b_set) / len(a_set | b_set)


def contains_any(source: List[str], targets: List[str]) -> float:
    s = set(normalize_token_list(source))
    t = set(normalize_token_list(targets))
    if not t:
        return 0.0
    return len(s & t) / max(len(t), 1)


def location_score(student_loc: str, startup_loc: str) -> float:
    student_loc = student_loc.strip().lower()
    startup_loc = startup_loc.strip().lower()
    if startup_loc == "remote":
        return 1.0
    if student_loc == startup_loc:
        return 1.0
    if student_loc == "remote":
        return 0.8
    return 0.3


def compensation_score(student_wants_paid: bool, startup_paid: bool) -> float:
    if student_wants_paid and startup_paid:
        return 1.0
    if student_wants_paid and not startup_paid:
        return 0.0
    if not student_wants_paid and startup_paid:
        return 0.9
    return 0.8


def commitment_score(student_hours: int, startup_min_hours: int) -> float:
    if student_hours >= startup_min_hours:
        return 1.0
    gap = startup_min_hours - student_hours
    return max(0.0, 1 - gap / max(startup_min_hours, 1))


def experience_score(level: str) -> float:
    mapping = {
        "Beginner": 0.55,
        "Intermediate": 0.78,
        "Advanced": 1.0,
    }
    return mapping.get(level, 0.7)


def startup_to_student_score(startup: Dict, student: Dict) -> Tuple[float, Dict[str, float]]:
    # How attractive the student is to the startup
    role_fit = contains_any(student["preferred_roles"], startup["role_openings"])
    skill_fit = contains_any(student["skills"], startup["skills_needed"])
    mission_fit = overlap_score(student["interests"], startup["mission_keywords"])
    style_fit = overlap_score(student["work_style"], startup["work_style"])
    commit_fit = commitment_score(student["weekly_hours"], startup["min_commitment_hours"])
    pay_fit = compensation_score(student["wants_paid"], startup["paid"])
    loc_fit = location_score(student["location"], startup["location"])
    exp_fit = experience_score(student["experience_level"])

    weights = {
        "role_fit": 0.20,
        "skill_fit": 0.28,
        "mission_fit": 0.13,
        "style_fit": 0.12,
        "commit_fit": 0.10,
        "pay_fit": 0.07,
        "loc_fit": 0.05,
        "exp_fit": 0.05,
    }

    components = {
        "role_fit": role_fit,
        "skill_fit": skill_fit,
        "mission_fit": mission_fit,
        "style_fit": style_fit,
        "commit_fit": commit_fit,
        "pay_fit": pay_fit,
        "loc_fit": loc_fit,
        "exp_fit": exp_fit,
    }

    total = sum(weights[k] * components[k] for k in weights)
    return round(total, 4), components


def student_to_startup_score(student: Dict, startup: Dict) -> Tuple[float, Dict[str, float]]:
    # How attractive the startup is to the student
    role_fit = contains_any(startup["role_openings"], student["preferred_roles"])
    skill_fit = contains_any(startup["skills_needed"], student["skills"])
    mission_fit = overlap_score(student["interests"], startup["mission_keywords"])
    style_fit = overlap_score(student["work_style"], startup["work_style"])
    commit_fit = commitment_score(student["weekly_hours"], startup["min_commitment_hours"])
    pay_fit = compensation_score(student["wants_paid"], startup["paid"])
    loc_fit = location_score(student["location"], startup["location"])
    stage_fit = 1.0 if startup["stage"] in ["Seed", "Series A"] else 0.8

    weights = {
        "role_fit": 0.22,
        "skill_fit": 0.22,
        "mission_fit": 0.16,
        "style_fit": 0.12,
        "commit_fit": 0.08,
        "pay_fit": 0.10,
        "loc_fit": 0.05,
        "stage_fit": 0.05,
    }

    components = {
        "role_fit": role_fit,
        "skill_fit": skill_fit,
        "mission_fit": mission_fit,
        "style_fit": style_fit,
        "commit_fit": commit_fit,
        "pay_fit": pay_fit,
        "loc_fit": loc_fit,
        "stage_fit": stage_fit,
    }

    total = sum(weights[k] * components[k] for k in weights)
    return round(total, 4), components


def explain_match(startup: Dict, student: Dict, s_to_t_components: Dict[str, float], t_to_s_components: Dict[str, float]) -> str:
    reasons = []

    shared_skills = sorted(set(normalize_token_list(student["skills"])) & set(normalize_token_list(startup["skills_needed"])))
    shared_roles = sorted(set(normalize_token_list(student["preferred_roles"])) & set(normalize_token_list(startup["role_openings"])))
    shared_values = sorted(set(normalize_token_list(student["interests"])) & set(normalize_token_list(startup["mission_keywords"])))
    shared_style = sorted(set(normalize_token_list(student["work_style"])) & set(normalize_token_list(startup["work_style"])))

    if shared_roles:
        reasons.append(f"strong role alignment: {', '.join(shared_roles[:3])}")
    if shared_skills:
        reasons.append(f"relevant skills overlap: {', '.join(shared_skills[:4])}")
    if shared_values:
        reasons.append(f"mission overlap around {', '.join(shared_values[:3])}")
    if shared_style:
        reasons.append(f"compatible work style: {', '.join(shared_style[:3])}")
    if student["weekly_hours"] >= startup["min_commitment_hours"]:
        reasons.append("student meets the weekly commitment")
    if startup["paid"] and student["wants_paid"]:
        reasons.append("compensation preferences align")
    if startup["location"].lower() == "remote" or student["location"].lower() == startup["location"].lower():
        reasons.append("location setup works well")

    if not reasons:
        reasons.append("overall profile similarity is above threshold")

    return f"{student['name']} matches with {startup['startup_name']} because of " + "; ".join(reasons[:5]) + "."


def build_preference_rankings(startups: List[Dict], students: List[Dict]):
    startup_pref = {}
    student_pref = {}
    pair_scores = []

    for startup in startups:
        scored_students = []
        for student in students:
            startup_score, s_components = startup_to_student_score(startup, student)
            student_score, t_components = student_to_startup_score(student, startup)
            mutual_score = round(0.5 * startup_score + 0.5 * student_score, 4)

            scored_students.append((student["student_id"], mutual_score))
            pair_scores.append({
                "startup_id": startup["startup_id"],
                "startup_name": startup["startup_name"],
                "student_id": student["student_id"],
                "student_name": student["name"],
                "startup_score": startup_score,
                "student_score": student_score,
                "mutual_score": mutual_score,
                "explanation": explain_match(startup, student, s_components, t_components),
            })

        scored_students.sort(key=lambda x: x[1], reverse=True)
        startup_pref[startup["startup_id"]] = [sid for sid, _ in scored_students]

    for student in students:
        scored_startups = []
        for startup in startups:
            startup_score, _ = startup_to_student_score(startup, student)
            student_score, _ = student_to_startup_score(student, startup)
            mutual_score = round(0.5 * startup_score + 0.5 * student_score, 4)
            scored_startups.append((startup["startup_id"], mutual_score))

        scored_startups.sort(key=lambda x: x[1], reverse=True)
        student_pref[student["student_id"]] = [sid for sid, _ in scored_startups]

    return startup_pref, student_pref, pd.DataFrame(pair_scores)


def stable_match(startup_pref: Dict[str, List[str]], student_pref: Dict[str, List[str]]) -> Dict[str, str]:
    """
    Startup-proposing Gale-Shapley.
    Each startup gets one student in this simple version.
    Extend later for multiple seats per startup.
    Returns: {startup_id: student_id}
    """
    free_startups = list(startup_pref.keys())
    proposals = {s: [] for s in startup_pref}
    student_match = {}

    student_rank = {}
    for student_id, prefs in student_pref.items():
        student_rank[student_id] = {startup_id: rank for rank, startup_id in enumerate(prefs)}

    while free_startups:
        startup = free_startups.pop(0)
        prefs = startup_pref[startup]

        next_student = None
        for student in prefs:
            if student not in proposals[startup]:
                next_student = student
                proposals[startup].append(student)
                break

        if next_student is None:
            continue

        if next_student not in student_match:
            student_match[next_student] = startup
        else:
            current_startup = student_match[next_student]
            if student_rank[next_student][startup] < student_rank[next_student][current_startup]:
                student_match[next_student] = startup
                free_startups.append(current_startup)
            else:
                free_startups.append(startup)

    return {startup_id: student_id for student_id, startup_id in student_match.items()}


def get_lookup(records: List[Dict], key: str) -> Dict[str, Dict]:
    return {r[key]: r for r in records}


# -----------------------------
# Session state
# -----------------------------
if "startups" not in st.session_state:
    st.session_state.startups = STARTUPS.copy()
if "students" not in st.session_state:
    st.session_state.students = STUDENTS.copy()

# -----------------------------
# Sidebar
# -----------------------------
st.sidebar.title("Match Platform")
st.sidebar.markdown("Startup ↔ Student Matching System")
page = st.sidebar.radio(
    "Navigate",
    [
    "Overview",
    "Add Startup",
    "Add Student",
    "Profiles",
    "Match Insights",
    "Final Matches",
    ]
)

# -----------------------------
# Pages
# -----------------------------
if page == "Overview":
    st.title("Startup Talent Match Platform")

    st.markdown(
        """
        <h4 style='color: gray;'>Connecting high-potential students with early-stage startups — fast.</h4>
        """,
    unsafe_allow_html=True
    )

    c1, c2, c3 = st.columns(3)
    c1.metric("Startups", len(st.session_state.startups))
    c2.metric("Students", len(st.session_state.students))
    c3.metric("Matches Evaluated", len(st.session_state.startups) * len(st.session_state.students))

    st.divider()

    st.subheader("How it works")

    st.markdown(
        """
        1. **Startups** define roles, skills, and team needs  
        2. **Students** submit experience, interests, and preferences  
        3. The system evaluates compatibility across multiple dimensions  
        4. A stable matching algorithm assigns optimal pairings  
        5. Each match includes a clear explanation of fit  
        """
    )

    st.divider()

    st.subheader("Why this matters")

    st.markdown(
        """
        Early-stage startups need the right people — fast.  
        Students want meaningful, high-impact experiences.  

        This system helps both sides find strong matches efficiently and transparently.
        """
    )

elif page == "Add Startup":
    st.title("Add Startup / Founder")
    with st.form("startup_form"):
        startup_name = st.text_input("Startup name")
        founder_name = st.text_input("Founder name")
        industry = st.text_input("Industry", placeholder="Fintech, Healthtech, Climate...")
        stage = st.selectbox("Stage", ["Pre-Seed", "Seed", "Series A", "Series B+"])
        location = st.text_input("Location", placeholder="Remote, New York, San Francisco...")
        team_size = st.number_input("Team size", min_value=1, max_value=1000, value=5)
        role_openings = st.text_input("Role openings (comma-separated)", placeholder="Product, Data, Software")
        skills_needed = st.text_input("Skills needed (comma-separated)", placeholder="python, sql, growth, figma")
        mission_keywords = st.text_input("Mission keywords (comma-separated)", placeholder="financial literacy, climate, patients")
        work_style = st.text_input("Work style (comma-separated)", placeholder="ownership, ambiguity, fast-paced")
        min_commitment_hours = st.slider("Minimum weekly hours", 1, 40, 10)
        paid = st.checkbox("Paid opportunity", value=True)
        blurb = st.text_area("Short startup blurb")
        submitted = st.form_submit_button("Add startup")

        if submitted:
            new_id = f"S{len(st.session_state.startups) + 1}"
            st.session_state.startups.append({
                "startup_id": new_id,
                "startup_name": startup_name,
                "founder_name": founder_name,
                "industry": industry,
                "stage": stage,
                "location": location,
                "team_size": int(team_size),
                "role_openings": [x.strip() for x in role_openings.split(",") if x.strip()],
                "skills_needed": [x.strip() for x in skills_needed.split(",") if x.strip()],
                "mission_keywords": [x.strip() for x in mission_keywords.split(",") if x.strip()],
                "work_style": [x.strip() for x in work_style.split(",") if x.strip()],
                "min_commitment_hours": int(min_commitment_hours),
                "paid": paid,
                "blurb": blurb,
            })
            st.success(f"Added {startup_name}.")

elif page == "Add Student":
    st.title("Add Student")
    with st.form("student_form"):
        name = st.text_input("Student name")
        school = st.text_input("School")
        year = st.selectbox("Year", ["Freshman", "Sophomore", "Junior", "Senior", "Master's", "MBA", "PhD"])
        location = st.text_input("Location", placeholder="Remote, Philadelphia, New York...")
        preferred_roles = st.text_input("Preferred roles (comma-separated)", placeholder="Product, Data, Software")
        skills = st.text_input("Skills (comma-separated)", placeholder="python, sql, figma")
        interests = st.text_input("Mission / industry interests (comma-separated)", placeholder="fintech, climate, health")
        work_style = st.text_input("Work style (comma-separated)", placeholder="ownership, collaborative, analytical")
        weekly_hours = st.slider("Available weekly hours", 1, 40, 10)
        wants_paid = st.checkbox("Needs paid opportunity", value=True)
        mission_statement = st.text_area("Why this student wants a startup role")
        experience_level = st.selectbox("Experience level", ["Beginner", "Intermediate", "Advanced"])
        submitted = st.form_submit_button("Add student")

        if submitted:
            new_id = f"T{len(st.session_state.students) + 1}"
            st.session_state.students.append({
                "student_id": new_id,
                "name": name,
                "school": school,
                "year": year,
                "location": location,
                "preferred_roles": [x.strip() for x in preferred_roles.split(",") if x.strip()],
                "skills": [x.strip() for x in skills.split(",") if x.strip()],
                "interests": [x.strip() for x in interests.split(",") if x.strip()],
                "work_style": [x.strip() for x in work_style.split(",") if x.strip()],
                "weekly_hours": int(weekly_hours),
                "wants_paid": wants_paid,
                "mission_statement": mission_statement,
                "experience_level": experience_level,
            })
            st.success(f"Added {name}.")

elif page == "Profiles":
    st.title("Profiles")
    tab1, tab2 = st.tabs(["Startups", "Students"])

    with tab1:
        for startup in st.session_state.startups:
            with st.expander(f"{startup['startup_name']} · {startup['founder_name']}"):
                st.json(startup)

    with tab2:
        for student in st.session_state.students:
            with st.expander(f"{student['name']} · {student['school']}"):
                st.json(student)

elif page == "Match Insights":
    st.title("Pairwise Match Scores")
    startup_pref, student_pref, scores_df = build_preference_rankings(
        st.session_state.startups,
        st.session_state.students,
    )

    sort_col = st.selectbox("Sort by", ["mutual_score", "startup_score", "student_score"])
    filtered = scores_df.sort_values(sort_col, ascending=False).reset_index(drop=True)
    st.dataframe(filtered, use_container_width=True)

    st.subheader("Inspect a specific pairing")
    selected_row = st.selectbox(
        "Choose a startup-student pair",
        filtered.index,
        format_func=lambda i: f"{filtered.loc[i, 'startup_name']} ↔ {filtered.loc[i, 'student_name']}"
    )
    row = filtered.loc[selected_row]
    st.markdown(f"**Mutual score:** {row['mutual_score']}")
    st.write(row["explanation"])

elif page == "Final Matches":
    st.title("Stable Match Results")
    startup_pref, student_pref, scores_df = build_preference_rankings(
        st.session_state.startups,
        st.session_state.students,
    )
    matches = stable_match(startup_pref, student_pref)

    startup_lookup = get_lookup(st.session_state.startups, "startup_id")
    student_lookup = get_lookup(st.session_state.students, "student_id")

    rows = []
    for startup_id, student_id in matches.items():
        startup = startup_lookup[startup_id]
        student = student_lookup[student_id]
        match_row = scores_df[
            (scores_df["startup_id"] == startup_id) &
            (scores_df["student_id"] == student_id)
        ].iloc[0]
        rows.append({
            "startup": startup["startup_name"],
            "founder": startup["founder_name"],
            "student": student["name"],
            "school": student["school"],
            "mutual_score": match_row["mutual_score"],
            "why": match_row["explanation"],
        })

    if rows:
        results_df = pd.DataFrame(rows).sort_values("mutual_score", ascending=False)
        st.dataframe(results_df, use_container_width=True)

        st.subheader("Narrative view")
        for _, r in results_df.iterrows():
            with st.container():
                st.markdown(f"### {r['startup']} ↔ {r['student']}")
                st.write(f"Founder: {r['founder']} | School: {r['school']} | Mutual score: {r['mutual_score']}")
                st.write(r["why"])
                st.divider()
    else:
        st.info("No stable matches found yet.")
