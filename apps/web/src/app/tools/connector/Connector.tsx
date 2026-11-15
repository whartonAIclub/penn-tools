"use client";

// Connector's screens, in order: the profile form, the questions, then a
// review of the answers. "Ready to be matched" saves the sign-up and moves on
// to the waiting screen (./waiting) until the team releases matches.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerIds, type Cohort, type Question } from "@penntools/tool-connector";
import { ProfileForm, type Profile } from "./ProfileForm";
import { Questions, type Answers } from "./Questions";
import { SkyScene } from "./sky/SkyContext";
import { saveSignup } from "./actions";
import styles from "./Connector.module.css";

type Step = "profile" | "questions" | "summary";

const EMPTY_PROFILE: Profile = { firstName: "", lastName: "", cohort: "" };

interface Props {
  questions: readonly Question[];
  cohorts: readonly Cohort[];
}

export function Connector({ questions, cohorts }: Props) {
  const [step, setStep] = useState<Step>("profile");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [answers, setAnswers] = useState<Answers>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const router = useRouter();

  function save(finalAnswers: Answers) {
    setSaveError(null);
    startSaving(async () => {
      const result = await saveSignup({ ...profile, answers: finalAnswers });
      if (result.ok) router.push("/tools/connector/waiting");
      else setSaveError(result.error);
    });
  }

  if (step === "profile") {
    return (
      <ProfileForm
        cohorts={cohorts}
        initial={profile}
        onContinue={(p) => {
          setProfile(p);
          setStep("questions");
        }}
      />
    );
  }

  if (step === "questions") {
    return (
      <Questions
        questions={questions}
        initial={answers}
        onBack={() => setStep("profile")}
        onDone={(a) => {
          setAnswers(a);
          setSaveError(null);
          setStep("summary");
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      {/* Every question answered: only "your" stars are left. */}
      <SkyScene progress={1} />
      <h1 className={styles.title}>Review your answers</h1>
      <p className={styles.intro}>
        Looking good, {profile.firstName}? Once you&apos;re matched, your answers are locked in.
      </p>
      <dl className={styles.review}>
        <div className={styles.reviewRow}>
          <dt>Cohort</dt>
          <dd>
            <span className={styles.chip}>Cohort {profile.cohort}</span>
          </dd>
        </div>
        {questions.map((q) => {
          const labels = answerIds(answers[q.id]).map((id) => q.options.find((o) => o.id === id)?.label ?? id);
          return (
            <div key={q.id} className={styles.reviewRow}>
              <dt>{q.short}</dt>
              <dd>
                {labels.map((label, i) => (
                  <span key={label} className={styles.chip}>
                    {q.kind === "rank" && <span className={styles.chipRank}>{i + 1}</span>}
                    {label}
                  </span>
                ))}
              </dd>
            </div>
          );
        })}
      </dl>

      {saveError && <p className={styles.error}>{saveError}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={saving} onClick={() => save(answers)}>
          {saving ? "Saving…" : "Ready to be matched"}
        </button>
        <button type="button" className={styles.secondary} disabled={saving} onClick={() => setStep("questions")}>
          Change answers
        </button>
      </div>
    </div>
  );
}
