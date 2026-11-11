"use client";

// Recommended majors from the student's ratings: the top three with the plan
// behind each score, the best pair of majors, and every major's fit.

import { useMemo } from "react";
import {
  MAJORS_RETRIEVED,
  MULTIPLE_MAJOR_RULES,
  bestPair,
  recommendMajors,
  type Catalog,
  type MajorFit,
  type Rating,
  type Ratings,
  type Taken,
} from "@penntools/tool-choose-mba-major";
import styles from "./CourseRanker.module.css";

const TOP = 3;
export const MIN_RATINGS = 5;

function percent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function cu(credits: number): string {
  return `${credits} CU`;
}

function FitBar({ score }: { score: number }) {
  return (
    <div className={styles.progress} aria-hidden>
      <div className={styles.progressBar} style={{ width: percent(score) }} />
    </div>
  );
}

function MajorCard({
  fit,
  rank,
  termLabel,
  ratingLabels,
}: {
  fit: MajorFit;
  rank: number;
  termLabel: string;
  ratingLabels: Readonly<Record<Rating, string>>;
}) {
  const { major } = fit;
  return (
    <article className={styles.major}>
      <div className={styles.majorHead}>
        <h3 className={styles.majorName}>
          <span className={styles.majorRank}>{rank}</span> {major.name}
        </h3>
        <span className={styles.fit}>{percent(fit.score)} fit</span>
      </div>
      <FitBar score={fit.score} />
      <p className={styles.note}>
        {cu(fit.plannedCredits)} of {cu(fit.targetCredits)} beyond the core planned from {termLabel} courses.
      </p>

      {fit.plan.length > 0 && (
        <ul className={styles.planList}>
          {fit.plan.map((item) => (
            <li key={item.course.code} className={styles.planItem}>
              <span
                className={item.rating ? styles.rankRating : styles.unrated}
                title={item.rating ? ratingLabels[item.rating] : "Not rated"}
              >
                {item.rating ?? "–"}
              </span>
              <span className={styles.code}>{item.course.code}</span>
              <span className={styles.planTitle}>{item.course.title}</span>
              <span className={styles.planMeta}>
                {cu(item.credits)}
                {item.taken && " · Taking / taken"}
                {item.required && " · Required"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(fit.gaps.length > 0 || fit.requiredNotOffered.length > 0) && (
        <div className={styles.gaps}>
          <strong>Still needed:</strong>
          <ul>
            {fit.gaps.map((gap) => (
              <li key={gap.label}>
                {cu(gap.credits)} from {gap.label}
              </li>
            ))}
            {fit.requiredNotOffered.map((code) => (
              <li key={code}>
                {code} is required but not offered in {termLabel}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className={styles.description}>
        <summary>Requirements and rules</summary>
        <p>
          {major.name} requires {cu(major.credits)} in total.
        </p>
        <ul className={styles.notes}>
          {major.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <a className={styles.link} href={major.source} target="_blank" rel="noreferrer">
          Full requirements on Wharton&apos;s site
        </a>
      </details>
    </article>
  );
}

export function Recommendations({
  catalog,
  ratings,
  taken,
  ratedCount,
  ratingLabels,
}: {
  catalog: Catalog;
  ratings: Ratings;
  taken: Taken;
  ratedCount: number;
  ratingLabels: Readonly<Record<Rating, string>>;
}) {
  const enough = ratedCount >= MIN_RATINGS;
  const fits = useMemo(
    () => (enough ? recommendMajors(catalog.courses, ratings, undefined, taken) : []),
    [enough, catalog.courses, ratings, taken],
  );
  const pair = useMemo(
    () => (enough ? bestPair(fits, catalog.courses, ratings, { taken }) : null),
    [enough, fits, catalog.courses, ratings, taken],
  );

  return (
    <section className={styles.card} id="recommendations">
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <span className={styles.step}>2</span> Your recommended majors
        </h2>
      </div>

      {!enough ? (
        <p className={styles.note}>
          Rate at least {MIN_RATINGS} courses above 0 to see recommendations ({ratedCount} so far). The more you rate, the
          better they get.
        </p>
      ) : (
        <>
          <p className={styles.note}>
            Fit is how much of each major you could fill with courses you rated highly: 100% means every credit is a
            course you rated 5 or are taking or have taken. Courses you&apos;re taking or have taken go in first;
            courses at 0 are never chosen.
          </p>

          {fits.slice(0, TOP).map((fit, i) => (
            <MajorCard
              key={fit.major.id}
              fit={fit}
              rank={i + 1}
              termLabel={catalog.termLabel}
              ratingLabels={ratingLabels}
            />
          ))}

          {pair && (
            <div className={styles.pair}>
              <h3 className={styles.majorName}>Thinking about two majors?</h3>
              <p className={styles.pairText}>
                <strong>
                  {pair.first.major.name} + {pair.second.major.name}
                </strong>{" "}
                fit you best together, at {percent(pair.score)}
                {pair.sharedCredits > 0 && `, sharing ${cu(pair.sharedCredits)} of courses`}.
              </p>
              <details className={styles.description}>
                <summary>Rules for more than one major</summary>
                <ul className={styles.notes}>
                  {MULTIPLE_MAJOR_RULES.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          <details className={styles.description}>
            <summary>All {fits.length} majors</summary>
            <ol className={styles.allMajors}>
              {fits.map((fit) => (
                <li key={fit.major.id}>
                  <span className={styles.allName}>{fit.major.name}</span>
                  <span className={styles.allBar}>
                    <FitBar score={fit.score} />
                  </span>
                  <span className={styles.allScore}>{percent(fit.score)}</span>
                </li>
              ))}
            </ol>
          </details>

          <p className={styles.note}>
            Based on {catalog.termLabel} courses only, and on major requirements as of {MAJORS_RETRIEVED}. Majors are
            usually completed over two years, and some limits (independent studies, Global Modular Courses, courses
            that can&apos;t both count) aren&apos;t checked here. Confirm your plan with your academic advisor.
          </p>
        </>
      )}
    </section>
  );
}
