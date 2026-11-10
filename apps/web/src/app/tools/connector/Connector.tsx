"use client";

// Connector's screens, in order: the profile form, the questions, then a
// summary of the answers. Finishing the questions saves the sign-up.

import { useState, useTransition } from "react";
import type { Cohort, Question } from "@penntools/tool-connector";
import { ProfileForm, type Profile } from "./ProfileForm";
import { Questions, type Answers } from "./Questions";
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

  function save(finalAnswers: Answers) {
    setSaveError(null);
    startSaving(async () => {
      const result = await saveSignup({ ...profile, answers: finalAnswers });
      if (!result.ok) setSaveError(result.error);
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
        onBack={() => setStep("profile")}
        onDone={(a) => {
          setAnswers(a);
          setStep("summary");
          save(a);
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Thanks, {profile.firstName}!</h1>
      <p className={styles.intro}>Here&apos;s what you told us.</p>
      <dl className={styles.card}>
        <div className={styles.answer}>
          <dt>Cohort</dt>
          <dd>{profile.cohort}</dd>
        </div>
        {questions.map((q) => (
          <div key={q.id} className={styles.answer}>
            <dt>{q.prompt}</dt>
            <dd>{q.options.find((o) => o.id === answers[q.id])?.label}</dd>
          </div>
        ))}
      </dl>

      {saving ? (
        <p className={styles.intro}>Saving…</p>
      ) : saveError ? (
        <p className={styles.error}>
          {saveError}{" "}
          <button type="button" className={styles.back} onClick={() => save(answers)}>
            Try again
          </button>
        </p>
      ) : (
        <p className={styles.success}>Saved. You can change your answers anytime.</p>
      )}

      <div>
        <button type="button" className={styles.back} onClick={() => setStep("questions")}>
          ← Change answers
        </button>
      </div>
    </div>
  );
}
