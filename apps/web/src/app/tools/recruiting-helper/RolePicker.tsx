"use client";

// Picking target roles as keywords: common MBA roles to click, plus any the
// student adds. The choice is kept as one comma-separated string (the
// profile's targetRoles, which scoring reads), so profiles saved before this
// picker existed open with their roles already selected.

import { useState } from "react";
import styles from "./RecruitingHelper.module.css";

/** Common post-MBA roles, broad enough for most students' searches. */
export const COMMON_ROLES = [
  "Strategic partnerships",
  "Business development",
  "Alliances / channel",
  "Platform / ecosystem",
  "Corporate development / M&A",
  "Product management",
  "Strategy & operations",
  "Go-to-market",
  "Marketing / brand",
  "Program management",
  "Sales / account management",
  "General management / rotational",
  "Management consulting",
  "Investment banking",
  "Private equity",
  "Venture capital",
  "Finance / FP&A",
  "Operations / supply chain",
  "Startups / entrepreneurship",
] as const;

const MAX_ROLE_LENGTH = 60;

/** The roles in a targetRoles string: split on commas, semicolons and new lines. */
export function parseRoles(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[,;\n]/)
    .map((role) => role.trim())
    .filter((role) => {
      const key = role.toLowerCase();
      if (!role || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function RolePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [custom, setCustom] = useState("");
  const selected = parseRoles(value);
  const isSelected = (role: string) => selected.some((s) => s.toLowerCase() === role.toLowerCase());
  const set = (roles: string[]) => onChange(roles.join(", "));
  // The student's own roles, shown after the common ones.
  const own = selected.filter((role) => !COMMON_ROLES.some((common) => common.toLowerCase() === role.toLowerCase()));

  function toggle(role: string) {
    set(isSelected(role) ? selected.filter((s) => s.toLowerCase() !== role.toLowerCase()) : [...selected, role]);
  }

  function addCustom() {
    // Commas would split it into several roles, which is what someone typing "a, b" means anyway.
    const added = parseRoles(custom).filter((role) => !isSelected(role)).map((role) => role.slice(0, MAX_ROLE_LENGTH));
    if (added.length) set([...selected, ...added]);
    setCustom("");
  }

  return (
    <div className={styles.roles}>
      <div className={styles.chips} role="group" aria-label="Roles you're targeting">
        {COMMON_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            className={isSelected(role) ? styles.chipOn : styles.chip}
            aria-pressed={isSelected(role)}
            onClick={() => toggle(role)}
          >
            {role}
          </button>
        ))}
        {own.map((role) => (
          <button
            key={role}
            type="button"
            className={styles.chipOn}
            aria-pressed
            aria-label={`Remove ${role}`}
            onClick={() => toggle(role)}
          >
            {role} ×
          </button>
        ))}
      </div>
      <div className={styles.row}>
        <input
          className={styles.input}
          value={custom}
          maxLength={200}
          placeholder="Add your own, e.g. AI partnerships, climate tech"
          aria-label="Add a role of your own"
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <button type="button" className={styles.uploadButton} onClick={addCustom} disabled={!custom.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
