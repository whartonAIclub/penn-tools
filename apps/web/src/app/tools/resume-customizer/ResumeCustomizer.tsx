"use client";

// Resume Customizer's page: upload files, tailor the resume to a job with the
// AI API (tailor/route.ts), edit it with an AI chat, compare it with the original,
// and download it as a PDF or Word document of real text (exportResume.ts).
// This holds the state the steps share; each screen is its own file.

import { useEffect, useRef, useState } from "react";
import { Geist, Libre_Baskerville } from "next/font/google";
import type { AIProvider } from "@penntools/core/ai";
import { DEFAULT_SETTINGS, type ContextFile, type ExportSettings, type FileTag, type ResumeDoc } from "@penntools/tool-resume-customizer/resume";
import type { ActionError, ActionResult } from "./actions";
import { EMPTY_CHAT, nextChat, type Chat } from "./AiChatPanel";
import { ComparisonScreen } from "./ComparisonScreen";
import { EditScreen } from "./EditScreen";
import { ExportScreen } from "./ExportScreen";
import { GeneratingScreen } from "./GeneratingScreen";
import { LandingScreen } from "./LandingScreen";
import { OnboardingScreen } from "./OnboardingScreen";
import { registerEditorFonts } from "./exportResume";
import { contextFiles, parseFiles, type UploadedFile } from "./parseFile";
import { UNREACHABLE, cx, type ProviderChoice } from "./shared";
import { StepBar, type Screen } from "./StepBar";
import { WorkspaceScreen } from "./WorkspaceScreen";
import styles from "./ResumeCustomizer.module.css";

const sansFont = Geist({ subsets: ["latin"], variable: "--rc-sans" });
const serifFont = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--rc-serif" });

const SIGNED_OUT: ActionError = { message: "Sign in with the button at the top right to use Resume Customizer." };

/**
 * The resume tailored by tailor/route.ts. Aborting `signal` cancels the AI
 * call on the server too, and makes this throw an AbortError.
 */
async function requestTailor(
  provider: AIProvider,
  input: { resume: string; jobDescription: string; files: ContextFile[] },
  signal: AbortSignal,
): Promise<ActionResult<ResumeDoc>> {
  const res = await fetch("/tools/resume-customizer/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, ...input }),
    signal,
  });
  if (res.status === 401) return { ok: false, error: SIGNED_OUT };
  const body = (await res.json().catch(() => null)) as ActionResult<ResumeDoc> | null;
  return body && typeof body.ok === "boolean" ? body : { ok: false, error: UNREACHABLE };
}

export function ResumeCustomizer({ providers, labels }: {
  /** Providers the user can call (ai.providers()); never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
}) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [baseId, setBaseId] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [provider, setProvider] = useState(providers[0]!);
  const [genError, setGenError] = useState<ActionError | null>(null);
  /** Counts generations, so each attempt (Try again included) gets a fresh progress screen. */
  const [attempt, setAttempt] = useState(0);
  /** The base resume's text the current resume was tailored from. */
  const [baseText, setBaseText] = useState("");
  const [doc, setDoc] = useState<ResumeDoc | null>(null);
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS);
  const [chat, setChat] = useState<Chat>(EMPTY_CHAT);
  /** The generation under way, aborted to cancel it: the AI call stops too. */
  const generation = useRef<AbortController | null>(null);
  // Leaving the page mid-generation cancels it, rather than paying for a
  // resume no one will see.
  useEffect(() => () => generation.current?.abort(), []);
  // The PDF's fonts, for the editor and Compare: downloaded only once text uses them.
  useEffect(registerEditorFonts, []);

  const providerChoice: ProviderChoice = { providers, labels, provider, setProvider };
  const resumes = files.filter((f) => f.tag === "Resume" && !f.error);
  const baseFile = resumes.find((f) => f.id === baseId) ?? resumes[0];

  const addFiles = async (list: FileList, tag: FileTag) => {
    const parsed = await parseFiles(list, tag);
    setFiles((prev) => [...prev, ...parsed]);
  };
  const tagFile = (id: string, tag: FileTag) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, tag } : f)));
  const deleteFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  // Started from the button, not an effect, so it runs once per click.
  const generate = async () => {
    if (!baseFile) return;
    generation.current?.abort();
    const controller = new AbortController();
    generation.current = controller;
    const input = { resume: baseFile.text, jobDescription, files: contextFiles(files, baseFile.id).files };
    setGenError(null);
    setAttempt((a) => a + 1);
    setScreen("generating");
    let result: ActionResult<ResumeDoc>;
    try {
      result = await requestTailor(provider, input, controller.signal);
    } catch {
      result = { ok: false, error: UNREACHABLE };
    }
    if (controller.signal.aborted) return;
    generation.current = null;
    if (!result.ok) {
      setGenError(result.error);
      return;
    }
    setBaseText(input.resume);
    setDoc(result.data);
    setChat(nextChat);
    setScreen("edit");
  };
  const cancelGeneration = () => {
    generation.current?.abort();
    generation.current = null;
    setGenError(null);
    setScreen("workspace");
  };

  const go = (next: Screen) => {
    // Edit, Compare and Export need a resume.
    if ((next === "edit" || next === "comparison" || next === "export") && !doc) return;
    setScreen(next);
  };

  return (
    <div className={cx(styles.shell, sansFont.variable, serifFont.variable)}>
      <StepBar screen={screen} setScreen={go} hasResume={doc !== null} />

      {screen === "landing" && <LandingScreen onNext={() => setScreen("onboarding")} />}

      {screen === "onboarding" && (
        <OnboardingScreen files={files} onAdd={addFiles} onTag={tagFile} onDelete={deleteFile} onNext={() => setScreen("workspace")} />
      )}

      {screen === "workspace" && (
        <WorkspaceScreen
          files={files}
          baseFile={baseFile}
          onSetBase={setBaseId}
          onAdd={addFiles}
          onTag={tagFile}
          onDelete={deleteFile}
          jobDescription={jobDescription}
          setJobDescription={setJobDescription}
          providerChoice={providerChoice}
          onGenerate={() => void generate()}
          hasResume={doc !== null}
        />
      )}

      {screen === "generating" && (
        <GeneratingScreen key={attempt} error={genError} onCancel={cancelGeneration} onRetry={() => void generate()} providerChoice={providerChoice} />
      )}

      {screen === "edit" && doc && (
        <EditScreen
          doc={doc}
          setDoc={setDoc}
          settings={settings}
          setSettings={setSettings}
          chat={chat}
          setChat={setChat}
          jobDescription={jobDescription}
          providerChoice={providerChoice}
          onCompare={() => setScreen("comparison")}
        />
      )}

      {screen === "comparison" && doc && (
        <ComparisonScreen
          doc={doc}
          settings={settings}
          baseText={baseText}
          jobDescription={jobDescription}
          onBack={() => setScreen("edit")}
          onExport={() => setScreen("export")}
        />
      )}

      {screen === "export" && doc && (
        <ExportScreen
          doc={doc}
          settings={settings}
          baseText={baseText}
          jobDescription={jobDescription}
          onRestart={() => {
            setDoc(null);
            setChat(nextChat);
            setJobDescription("");
            setScreen("workspace");
          }}
        />
      )}
    </div>
  );
}
