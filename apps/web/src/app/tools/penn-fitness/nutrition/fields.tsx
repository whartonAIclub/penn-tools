"use client";

// Form controls shared by the planner's steps.

import styles from "./Nutrition.module.css";

/** A checkbox per option; `selected` is the checked keys. */
export function Checkboxes<K extends string>({
  options,
  selected,
  onChange,
}: {
  options: Record<K, string>;
  selected: K[];
  onChange: (next: K[]) => void;
}) {
  return (
    <div className={styles.checkboxes}>
      {(Object.keys(options) as K[]).map((key) => (
        <label key={key} className={styles.checkbox}>
          <input
            type="checkbox"
            checked={selected.includes(key)}
            onChange={(e) => onChange(e.target.checked ? [...selected, key] : selected.filter((k) => k !== key))}
          />
          {options[key]}
        </label>
      ))}
    </div>
  );
}

export function Select<K extends string>({
  options,
  value,
  onChange,
}: {
  options: Record<K, string>;
  value: K;
  onChange: (next: K) => void;
}) {
  return (
    <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value as K)}>
      {(Object.keys(options) as K[]).map((key) => (
        <option key={key} value={key}>
          {options[key]}
        </option>
      ))}
    </select>
  );
}
