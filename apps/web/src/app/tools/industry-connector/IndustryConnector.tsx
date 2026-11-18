"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { PersonCard } from "@penntools/tool-industry-connector";
import { searchIndustry } from "./actions";
import { OutreachForm, type OutreachOptions, type SenderDetails } from "./OutreachForm";
import styles from "./IndustryConnector.module.css";

interface Props {
  industries: string[];
  /** People who have worked in each industry. */
  counts: Record<string, number>;
  /** Whether to show the link to the upload page. */
  canUpload: boolean;
  outreach: OutreachOptions;
}

/** A search's results, kept with the industry they were searched for. */
interface Results {
  industry: string;
  people: PersonCard[];
  total: number;
}

interface Section {
  title: string;
  items: { name: string; label: string }[];
}

const FAILED = "Something went wrong. Check your connection and try again.";

// "Health Care: Digital Health" is listed as "Digital Health" under "Health Care".
// Industries with no prefix go together under "More industries", unless another
// industry shares their name as a prefix (Energy).
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

export function IndustryConnector({ industries, counts, canUpload, outreach }: Props) {
  const [industry, setIndustry] = useState("");
  const [filter, setFilter] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftingFor, setDraftingFor] = useState<string | null>(null); // the person with the outreach form open
  // The student's own details, typed once and kept for every person they write to.
  const [sender, setSender] = useState<SenderDetails>({
    senderName: outreach.senderName,
    senderProgram: "",
    senderBackground: "",
    recruitingGoal: "",
  });
  const [pending, startTransition] = useTransition();

  const sections = useMemo(() => buildSections(industries), [industries]);
  const query = filter.trim().toLowerCase();
  const visible = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !query || i.name.toLowerCase().includes(query)) }))
    .filter((s) => s.items.length > 0);

  function seeStudents() {
    const searched = industry;
    startTransition(async () => {
      try {
        const res = await searchIndustry({ industry: searched, offset: 0 });
        if (!res.ok) return setError(res.error.message);
        setError(null);
        setResults({ industry: searched, ...res.data });
        setDraftingFor(null);
      } catch {
        setError(FAILED);
      }
    });
  }

  function showMore() {
    if (!results) return;
    const current = results;
    startTransition(async () => {
      try {
        const res = await searchIndustry({ industry: current.industry, offset: current.people.length });
        if (!res.ok) return setError(res.error.message);
        setError(null);
        setResults({ industry: current.industry, total: res.data.total, people: [...current.people, ...res.data.people] });
      } catch {
        setError(FAILED);
      }
    });
  }

  const errorMessage = error && (
    <p className={styles.error} role="alert">
      {error}
    </p>
  );

  if (results) {
    return (
      <div className={styles.page}>
        <header>
          <button type="button" className={styles.back} onClick={() => setResults(null)}>
            ← Choose a different industry
          </button>
          <h1 className={styles.title}>{results.industry}</h1>
          <p className={styles.muted}>
            {results.total} {results.total === 1 ? "person has" : "people have"} worked in this industry.
          </p>
        </header>
        {results.people.length === 0 ? (
          <p className={styles.muted}>No one in the directory has worked in this industry yet.</p>
        ) : (
          <>
            <ul className={styles.list}>
              {results.people.map((person) => (
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
                  {draftingFor === person.id && (
                    <OutreachForm
                      person={person}
                      industry={results.industry}
                      options={outreach}
                      sender={sender}
                      onSenderChange={setSender}
                    />
                  )}
                </li>
              ))}
            </ul>
            {errorMessage}
            {results.people.length < results.total && (
              <button type="button" className={styles.secondaryButton} onClick={showMore} disabled={pending}>
                {pending ? "Loading…" : `Show more (${results.total - results.people.length} left)`}
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
        {canUpload && (
          <p>
            <Link href="/tools/industry-connector/admin" className={styles.link}>
              Upload data (admins)
            </Link>
          </p>
        )}
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
                  // Locked while a search runs, so the results can't end up under another industry.
                  disabled={pending}
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

      {errorMessage}

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
