"use client";

// The Nutrition section. Opens on the dashboard; each part (about you, your
// week, eating, the plan, groceries, the log) opens as a panel from there, and
// first-time setup is a short wizard. Owns the data they share, keeps it in
// storage.ts, and makes plans with planWeek in actions.ts.

import { useEffect, useState } from "react";
import type { AIProvider } from "@penntools/core/ai";
import {
  DEFAULT_PLANNER_PROFILE,
  EMPTY_PREFERENCES,
  macroTargets,
  SAMPLE_MEAL_PLAN,
  type Day,
  type LoggedMeal,
  type Meal,
  type MealLog,
  type MealPlan,
  type NutritionPreferences,
  type PlannedMeal,
  type PlannerProfile,
  type WeeklySchedule,
} from "@penntools/tool-penn-fitness";
import { planWeek, type ActionError } from "./actions";
import {
  clearSetup,
  loadGroceryChecks,
  loadMeals,
  loadPlan,
  loadPlanBasis,
  loadPreferences,
  loadProfile,
  loadSchedule,
  loggingStreak,
  saveGroceryChecks,
  saveMeals,
  savePlan,
  savePlanBasis,
  savePreferences,
  saveProfile,
  saveSchedule,
  setupKey,
  spentThisWeek,
  today,
} from "./storage";
import { Dashboard, type Panel } from "./Dashboard";
import { Groceries } from "./Groceries";
import { AboutYouStep } from "./planner/AboutYouStep";
import { EatingStep } from "./planner/EatingStep";
import { MealPlanner } from "./planner/MealPlanner";
import { PlanView } from "./planner/PlanView";
import { ScheduleStep } from "./planner/ScheduleStep";
import { QuickLog } from "./QuickLog";
import { Today } from "./Today";
import styles from "./Nutrition.module.css";

/** Minutes after midnight, refreshed every minute so times stay current. */
function useNow() {
  const [now, setNow] = useState(() => minutesNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(minutesNow()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const PANEL_TITLES: Record<Panel, string> = {
  about: "🙋 About you",
  week: "📅 Your week",
  eating: "🍽️ Eating",
  plan: "🗓️ Your plan",
  groceries: "🛒 Groceries",
  log: "📝 Log & today",
};

/** Rough low/medium/high levels for a planned meal's grams, so it can be logged. */
function level(grams: number | null, medium: number, high: number): Meal["protein"] {
  if (grams === null || grams < medium) return "low";
  return grams < high ? "medium" : "high";
}

type View = { kind: "dashboard" } | { kind: "setup" } | { kind: "panel"; panel: Panel; day?: Day };

export function Nutrition({
  userId,
  userName,
  providers,
  labels,
  sampleText,
  sampleLog,
  maxLength,
}: {
  userId: string;
  userName: string | null;
  /** Providers the user has saved keys for; empty means preview mode. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  sampleText: string;
  sampleLog: MealLog;
  maxLength: number;
}) {
  const provider = providers[0];
  const preview = !provider;
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const [date, setDate] = useState("");
  const [preferences, setPreferences] = useState<NutritionPreferences | null>(null);
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [profile, setProfile] = useState<PlannerProfile | null>(null);
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [groceryChecks, setGroceryChecks] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<ActionError | null>(null);
  /** The setup the plan was made from (setupKey), or null if unknown. */
  const [planBasis, setPlanBasis] = useState<string | null>(null);
  const [weekSpent, setWeekSpent] = useState(0);
  const now = useNow();

  /** The setup as the planner sees it, with defaults filled in. */
  const currentKey = () => setupKey(profile ?? DEFAULT_PLANNER_PROFILE, preferences ?? EMPTY_PREFERENCES, schedule ?? []);
  /** The setup changed since the plan was made, so the plan may be out of date. */
  const planStale = plan !== null && planBasis !== null && planBasis !== currentKey();

  // localStorage exists only in the browser, so load after the first render.
  useEffect(() => {
    const day = today();
    setDate(day);
    const savedPreferences = loadPreferences(userId);
    const savedProfile = loadProfile(userId);
    const savedSchedule = loadSchedule(userId);
    const savedPlan = loadPlan(userId);
    setPreferences(savedPreferences);
    setMeals(loadMeals(userId, day));
    setProfile(savedProfile);
    setSchedule(savedSchedule);
    setPlan(savedPlan);
    // A plan saved before its setup was recorded is taken as made from today's setup.
    let basis = loadPlanBasis(userId);
    if (savedPlan && basis === null) {
      basis = setupKey(savedProfile ?? DEFAULT_PLANNER_PROFILE, savedPreferences ?? EMPTY_PREFERENCES, savedSchedule ?? []);
      savePlanBasis(userId, basis);
    }
    setPlanBasis(basis);
    setGroceryChecks(loadGroceryChecks(userId));
    setStreak(loggingStreak(userId));
    setWeekSpent(spentThisWeek(userId));
    setLoaded(true);
  }, [userId]);

  const home = () => setView({ kind: "dashboard" });
  /** Back to the dashboard after editing the setup; it offers to update the plan if that changed anything. */
  const savedSetup = home;

  /** Forgets the setup and plan, keeping the meal log, and starts again from the dashboard. */
  function startOver() {
    clearSetup(userId);
    setPreferences(null);
    setProfile(null);
    setSchedule(null);
    setPlan(null);
    setPlanBasis(null);
    setGroceryChecks([]);
    setPlanError(null);
    home();
  }

  function updatePreferences(next: NutritionPreferences) {
    setPreferences(next);
    savePreferences(userId, next);
  }

  function updateProfile(next: PlannerProfile) {
    setProfile(next);
    saveProfile(userId, next);
  }

  function updateSchedule(next: WeeklySchedule) {
    setSchedule(next);
    saveSchedule(userId, next);
  }

  function updatePlan(next: MealPlan, basis: string) {
    setPlan(next);
    savePlan(userId, next);
    setPlanBasis(basis);
    savePlanBasis(userId, basis);
    setGroceryChecks([]);
    saveGroceryChecks(userId, []);
  }

  function updateMeals(next: LoggedMeal[]) {
    setMeals(next);
    saveMeals(userId, date, next);
    setStreak(loggingStreak(userId));
    setWeekSpent(spentThisWeek(userId));
  }

  function addMeals(added: Meal[]) {
    const loggedAt = new Date().toISOString();
    updateMeals([...meals, ...added.map((meal) => ({ ...meal, id: crypto.randomUUID(), loggedAt }))]);
  }

  /** Logs a planned meal as eaten now. */
  function ate(planned: PlannedMeal) {
    const d = new Date();
    addMeals([
      {
        type: planned.type,
        time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
        place: planned.place ?? planned.placeType,
        foods: [{ name: planned.name, portion: null }],
        protein: level(planned.proteinG, 10, 25),
        carbs: level(planned.carbsG, 20, 50),
        fat: level(planned.fatG, 8, 20),
        estimatedCalories: null,
        proteinG: planned.proteinG,
        carbsG: planned.carbsG,
        fatG: planned.fatG,
        estimatedCost: planned.source === "eat-out" ? planned.estimatedCost : null,
        tags: [],
        warnings: [],
      },
    ]);
  }

  async function makePlan(currentProfile: PlannerProfile, currentPreferences: NutritionPreferences) {
    home();
    setPlanError(null);
    const basis = setupKey(currentProfile, currentPreferences, schedule ?? []);
    if (!provider) {
      updatePlan(SAMPLE_MEAL_PLAN, basis);
      return;
    }
    setPlanning(true);
    try {
      const result = await planWeek(provider, { preferences: currentPreferences, profile: currentProfile, schedule: schedule ?? [] });
      if (result.ok) updatePlan(result.data, basis);
      else setPlanError(result.error);
    } catch {
      setPlanError({ message: "Something went wrong. Try again." });
    } finally {
      setPlanning(false);
    }
  }

  if (!loaded) return null;

  if (view.kind === "setup") {
    return (
      <MealPlanner
        preview={preview}
        preferences={preferences}
        profile={profile}
        schedule={schedule}
        onSavePreferences={updatePreferences}
        onSaveProfile={updateProfile}
        onSaveSchedule={updateSchedule}
        onFinish={(p, prefs) => void makePlan(p, prefs)}
        onCancel={home}
      />
    );
  }

  if (view.kind === "dashboard") {
    return (
      <Dashboard
        name={userName}
        preview={preview}
        now={now}
        plan={plan}
        planning={planning}
        planError={planError}
        planStale={planStale}
        profile={profile}
        preferences={preferences}
        schedule={schedule}
        todaysMeals={meals}
        weekSpent={weekSpent}
        streak={streak}
        groceriesChecked={groceryChecks}
        onOpen={(panel, day) => setView({ kind: "panel", panel, ...(day ? { day } : {}) })}
        onSetup={() => (profile ? void makePlan(profile, preferences ?? EMPTY_PREFERENCES) : setView({ kind: "setup" }))}
        onStartOver={startOver}
        onAte={ate}
      />
    );
  }

  const currentProfile = profile ?? DEFAULT_PLANNER_PROFILE;
  const currentPreferences = preferences ?? EMPTY_PREFERENCES;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{PANEL_TITLES[view.panel]}</h2>
        <button className={styles.linkButton} onClick={home}>
          ← Dashboard
        </button>
      </div>

      {view.panel === "about" && (
        <AboutYouStep
          initialProfile={currentProfile}
          initialPreferences={currentPreferences}
          submitLabel="Save"
          onNext={(p, prefs) => {
            updateProfile(p);
            updatePreferences(prefs);
            savedSetup();
          }}
        />
      )}
      {view.panel === "week" && (
        <ScheduleStep
          initial={schedule ?? []}
          profile={currentProfile}
          submitLabel="Save"
          onBack={home}
          onNext={(next, homeAddress) => {
            updateSchedule(next);
            updateProfile({ ...currentProfile, home: homeAddress });
            savedSetup();
          }}
        />
      )}
      {view.panel === "eating" && (
        <EatingStep
          profile={currentProfile}
          preferences={currentPreferences}
          submitLabel="Save"
          onBack={home}
          onNext={(p, prefs) => {
            updateProfile(p);
            updatePreferences(prefs);
            savedSetup();
          }}
        />
      )}
      {view.panel === "plan" && (
        <PlanView
          plan={plan}
          schedule={schedule ?? []}
          targets={profile?.weightKg ? macroTargets(profile.weightKg, profile.activityLevel) : null}
          planning={planning}
          error={planError}
          preview={preview}
          initialDay={view.day}
          onRegenerate={() => void makePlan(currentProfile, currentPreferences)}
          onEdit={() => setView({ kind: "panel", panel: "about" })}
        />
      )}
      {view.panel === "groceries" && (
        <Groceries
          items={plan?.groceries ?? []}
          checked={groceryChecks}
          onToggle={(name) => {
            const next = groceryChecks.includes(name) ? groceryChecks.filter((n) => n !== name) : [...groceryChecks, name];
            setGroceryChecks(next);
            saveGroceryChecks(userId, next);
          }}
        />
      )}
      {view.panel === "log" && (
        <div className={styles.form}>
          <QuickLog
            providers={providers}
            labels={labels}
            sampleText={sampleText}
            sampleLog={sampleLog}
            maxLength={maxLength}
            preferences={preferences}
            onLogged={addMeals}
          />
          <Today meals={meals} now={now} onRemove={(id) => updateMeals(meals.filter((m) => m.id !== id))} />
        </div>
      )}
    </section>
  );
}
