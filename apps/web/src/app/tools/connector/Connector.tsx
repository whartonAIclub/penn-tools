"use client";

// Connector's screens, in order: the profile form, the questions, then a
// review of the answers. Review is the last chance to change them: "Ready to
// be matched" saves the sign-up and moves on to matching (./matching), which
// shows the student's group.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  function save(finalAnswers: Answers) {
    setSaveError(null);
    startSaving(async () => {
      const result = await saveSignup({ ...profile, answers: finalAnswers });
      if (result.ok) router.push("/tools/connector/matching");
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
      <h1 className={styles.title}>Review your answers</h1>
      <p className={styles.intro}>
        Looking good, {profile.firstName}? Once you&apos;re matched, your answers are locked in.
      </p>
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
