"use client";

// Step 3: cook or eat out, and the details for eating out: budget, Penn dining
// plan (with what it includes) and favorite places, picked from Penn-area
// outlets we have menus for or typed in. Budget and dining plan are saved with
// the food preferences; the rest to the planner profile.

import { useState } from "react";
import {
  DINING_PLANS,
  EATING_STYLES,
  FOOD_DATA_CHECKED_ON,
  NutritionPreferences,
  PlannerProfile,
  WEEKS_PER_SEMESTER,
  findDiningPlan,
  findOutlet,
  outletsForPlan,
  searchOutlets,
  type DiningPlan,
  type Outlet,
} from "@penntools/tool-penn-fitness";
import styles from "../Nutrition.module.css";

export function EatingStep({
  profile,
  preferences,
  submitLabel,
  onBack,
  onNext,
}: {
  profile: PlannerProfile;
  preferences: NutritionPreferences;
  submitLabel: string;
  onBack: () => void;
  onNext: (profile: PlannerProfile, preferences: NutritionPreferences) => void;
}) {
  const [eatingStyle, setEatingStyle] = useState(profile.eatingStyle);
  const [budget, setBudget] = useState(preferences.budgetPerMeal?.toString() ?? "");
  const [diningPlan, setDiningPlan] = useState(preferences.diningPlan);
  const [places, setPlaces] = useState(profile.favoritePlaces);
  const [error, setError] = useState<string | null>(null);
  const eatsOut = eatingStyle !== "cook";
  const plan = findDiningPlan(diningPlan);

  function next() {
    const nextProfile = PlannerProfile.safeParse({ ...profile, eatingStyle, favoritePlaces: places });
    const nextPreferences = NutritionPreferences.safeParse({
      ...preferences,
      budgetPerMeal: budget.trim() ? Number(budget) : null,
      diningPlan,
    });
    if (!nextProfile.success || !nextPreferences.success) {
      setError("Check your answers: the budget should be a number between 1 and 200, and each place under 60 characters.");
      return;
    }
    onNext(nextProfile.data, nextPreferences.data);
  }

  return (
    <div className={styles.form}>
      <fieldset className={styles.fieldset}>
        <legend>Do you want to cook or eat out?</legend>
        <div className={styles.styleCards}>
          {(Object.keys(EATING_STYLES) as (keyof typeof EATING_STYLES)[]).map((style) => (
            <label key={style} className={eatingStyle === style ? styles.styleCardActive : styles.styleCard}>
              <input type="radio" name="eating-style" checked={eatingStyle === style} onChange={() => setEatingStyle(style)} />
              <span aria-hidden="true">{style === "cook" ? "🧑‍🍳" : style === "eat-out" ? "🍴" : "🔀"}</span>
              {EATING_STYLES[style]}
            </label>
          ))}
        </div>
      </fieldset>

      {eatsOut && (
        <div className={styles.subsection}>
          <h3 className={styles.subTitle}>Eating out</h3>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              Budget per meal ($)
              <input className={styles.input} type="number" min={1} max={200} value={budget} placeholder="e.g. 12" onChange={(e) => setBudget(e.target.value)} />
            </label>
            <label className={styles.field}>
              Penn dining plan
              <select className={styles.select} value={diningPlan} onChange={(e) => setDiningPlan(e.target.value)}>
                <option value="none">No dining plan</option>
                {DINING_PLANS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {plan && <DiningPlanCard plan={plan} />}

          <PlacePicker places={places} onChange={setPlaces} />
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.controls}>
        <button className={styles.secondaryButton} onClick={onBack}>
          Back
        </button>
        <button className={styles.button} onClick={next}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/** What the chosen plan includes and where it works. */
function DiningPlanCard({ plan }: { plan: DiningPlan }) {
  const where = outletsForPlan(plan);
  const swipes = plan.swipesPerSemester ?? (plan.swipesPerWeek !== null ? plan.swipesPerWeek * WEEKS_PER_SEMESTER : null);
  return (
    <div className={styles.planCard}>
      <div className={styles.planStats}>
        <div>
          <strong>{swipes ?? "—"}</strong>
          <span>swipes / semester{swipes ? ` (~${Math.round(swipes / WEEKS_PER_SEMESTER)}/wk)` : ""}</span>
        </div>
        <div>
          <strong>{plan.diningDollarsPerSemester !== null ? `$${plan.diningDollarsPerSemester}` : "—"}</strong>
          <span>Dining Dollars / semester</span>
        </div>
        <div>
          <strong>{plan.pricePerSemester !== null ? `$${plan.pricePerSemester.toLocaleString()}` : "—"}</strong>
          <span>price / semester</span>
        </div>
      </div>
      <p className={styles.meta}>👤 {plan.eligibility}</p>
      {where.length > 0 && (
        <p className={styles.meta}>
          🍽️ Works at: {where.map((o) => o.name).join(", ")}. Your plan can suggest these.
        </p>
      )}
      {plan.notes && <p className={styles.meta}>ℹ️ {plan.notes}</p>}
      <p className={styles.meta}>
        From{" "}
        <a href={plan.sourceUrl} className={styles.link} target="_blank" rel="noreferrer">
          Penn Dining
        </a>
        , checked {FOOD_DATA_CHECKED_ON}. Confirm details with Penn Dining.
      </p>
    </div>
  );
}

const KIND_EMOJI: Record<Outlet["kind"], string> = { "dining-hall": "🏛️", cafe: "☕", market: "🛒", restaurant: "🍴" };

/** Pick favorite places: suggestions from Penn-area outlets we have menus for, or any name typed in. */
function PlacePicker({ places, onChange }: { places: string[]; onChange: (places: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const suggestions = searchOutlets(query).filter((o) => !places.some((p) => findOutlet(p)?.id === o.id));

  function add(name: string) {
    const trimmed = name.trim().slice(0, 60);
    if (trimmed && !places.some((p) => p.toLowerCase() === trimmed.toLowerCase())) onChange([...places, trimmed]);
    setQuery("");
  }

  return (
    <div className={styles.field}>
      Places you like to eat <span className={styles.hint}>(your plan picks these first, then your dining plan&apos;s, then other places near your classes)</span>
      <div className={styles.combo}>
        <input
          className={styles.input}
          value={query}
          placeholder="Search Penn spots, e.g. Chipotle, Houston Market…"
          role="combobox"
          aria-expanded={open}
          aria-controls="place-suggestions"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(suggestions[0] && query.trim() ? suggestions[0].name : query);
            }
          }}
        />
        {open && (suggestions.length > 0 || query.trim()) && (
          <ul id="place-suggestions" className={styles.comboList} role="listbox">
            {suggestions.map((o) => (
              <li key={o.id} role="option" aria-selected={false}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(o.name)}>
                  <span aria-hidden="true">{KIND_EMOJI[o.kind]}</span>
                  <span>
                    <strong>{o.name}</strong>
                    <small>
                      {o.address ?? o.nearBuildings[0] ?? ""}
                      {o.items.some((i) => i.calories !== null) ? " · 🥗 menu with nutrition" : o.items.length ? " · menu" : ""}
                      {o.acceptsSwipes ? " · swipes" : ""}
                      {o.acceptsDiningDollars ? " · Dining $" : ""}
                    </small>
                  </span>
                </button>
              </li>
            ))}
            {query.trim() && !suggestions.some((o) => o.name.toLowerCase() === query.trim().toLowerCase()) && (
              <li role="option" aria-selected={false}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(query)}>
                  <span aria-hidden="true">➕</span>
                  <span>
                    <strong>Add &quot;{query.trim()}&quot;</strong>
                    <small>Not in our list yet, so no menu</small>
                  </span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {places.length > 0 && (
        <div className={styles.chips}>
          {places.map((place) => {
            const outlet = findOutlet(place);
            return (
              <span key={place} className={outlet ? styles.placeChipActive : styles.placeChip} title={outlet ? `${outlet.items.length} menu items on file` : "No menu on file"}>
                {outlet ? KIND_EMOJI[outlet.kind] : "📍"} {place}
                <button type="button" className={styles.remove} aria-label={`Remove ${place}`} onClick={() => onChange(places.filter((p) => p !== place))}>
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
