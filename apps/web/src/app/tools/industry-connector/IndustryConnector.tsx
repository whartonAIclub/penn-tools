"use client";

import { useMemo, useState, useTransition } from "react";
import type { Person } from "@penntools/tool-industry-connector";
import { searchIndustry } from "./actions";
import { OutreachForm, type OutreachOptions } from "./OutreachForm";
import styles from "./IndustryConnector.module.css";

interface Props {
  industries: string[];
  /** People who have worked in each industry. */
  counts: Record<string, number>;
  outreach: OutreachOptions;
}

/** Results shown at first, and added by each "Show more". */
const PAGE = 50;

interface Section {
  title: string;
  items: { name: string; label: string }[];
}

// "Health Care: Digital Health" is listed as "Digital Health" under "Health Care".
// Industries with no prefix go together under "More industries", unless another
// industry shares their name as a prefix (Manufacturing).
function buildSections(industries: string[]): Section[] {
  const prefixes = new Set(industries.filter((i) => i.includes(": ")).map((i) => i.split(": ")[0]!));
  const sections = new Map<string, Section>();
  const loose: Section = { title: "More industries", items: [] };
  for (const name of industries) {
    const [prefix, rest] = name.includes(": ") ? (name.split(": ") as [string, string]) : [name, name];
    if (name.includes(": ") || prefixes.has(name)) {
      const section = sections.get(prefix) ?? { title: prefix, items: [] };
      section.items.push({ name, label: rest });
      sections.set(prefix, section);
    } else {
      loose.items.push({ name, label: name });
    }
  }
  return [...sections.values(), loose];
}

export function IndustryConnector({ industries, counts, outreach }: Props) {
  const [industry, setIndustry] = useState("");
  const [filter, setFilter] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftingFor, setDraftingFor] = useState<string | null>(null); // the person with the outreach form open
  const [shown, setShown] = useState(PAGE);
  const [pending, startTransition] = useTransition();

  const sections = useMemo(() => buildSections(industries), [industries]);
  const query = filter.trim().toLowerCase();
  const visible = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !query || i.name.toLowerCase().includes(query)) }))
    .filter((s) => s.items.length > 0);

  function seeStudents() {
    startTransition(async () => {
      const res = await searchIndustry(industry);
      if (res.ok) {
        setError(null);
        setResults(res.data);
        setDraftingFor(null);
        setShown(PAGE);
      } else {
        setError(res.error.message);
      }
    });
  }

  if (results) {
    return (
      <div className={styles.page}>
        <header>
          <button type="button" className={styles.back} onClick={() => setResults(null)}>
            ← Choose a different industry
          </button>
          <h1 className={styles.title}>{industry}</h1>
          <p className={styles.muted}>
            {results.length} {results.length === 1 ? "person has" : "people have"} worked in this industry.
          </p>
        </header>
        {results.length === 0 ? (
          <p className={styles.muted}>No one in the data has worked in this industry yet.</p>
        ) : (
          <>
            <ul className={styles.list}>
              {results.slice(0, shown).map((person) => (
                <li key={person.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.name}>{person.name}</div>
                      <div className={styles.muted}>
                        {person.program} · Class of {person.classYear}
                        {person.isAlumni && <span className={styles.tag}>Alumni</span>}
                      </div>
                      {person.currentEmployer && (
                        <div className={styles.current}>
                          Now: {person.currentTitle ? `${person.currentTitle}, ` : ""}
                          {person.currentEmployer}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      aria-expanded={draftingFor === person.id}
                      onClick={() => setDraftingFor(draftingFor === person.id ? null : person.id)}
                    >
                      {draftingFor === person.id ? "Close" : "Draft outreach note"}
                    </button>
                  </div>
                  {draftingFor === person.id && <OutreachForm person={person} industry={industry} options={outreach} />}
                </li>
              ))}
            </ul>
            {shown < results.length && (
              <button type="button" className={styles.secondaryButton} onClick={() => setShown(shown + PAGE)}>
                Show more ({results.length - shown} left)
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Industry Connections Tool</h1>
        <p className={styles.muted}>
          Choose the industry you&apos;re recruiting for to find Wharton MBA students and alumni who have worked in it.
        </p>
      </header>

      <section aria-labelledby="pick-industry">
        <h2 id="pick-industry" className={styles.subtitle}>Choose an industry</h2>
        <input
          type="search"
          className={styles.search}
          placeholder="Search industries…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Search industries"
        />
        {visible.length === 0 && <p className={styles.muted}>No industry matches &ldquo;{filter}&rdquo;.</p>}
        {visible.map((section) => (
          <div key={section.title} className={styles.group}>
            <h3 className={styles.groupTitle}>{section.title}</h3>
            <div className={styles.chips}>
              {section.items.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={`${styles.chip} ${item.name === industry ? styles.chipActive : ""}`}
                  aria-pressed={item.name === industry}
                  onClick={() => setIndustry(item.name === industry ? "" : item.name)}
                >
                  {item.label}
                  <span className={styles.count}>{counts[item.name] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <footer className={styles.footer}>
        <div>
          {industry ? (
            <>
              Selected: <strong>{industry}</strong>
            </>
          ) : (
            <span className={styles.muted}>No industry selected yet.</span>
          )}
        </div>
        <button type="button" className={styles.button} disabled={!industry || pending} onClick={seeStudents}>
          {pending ? "Searching…" : "See students"}
        </button>
      </footer>
    </div>
  );
}
