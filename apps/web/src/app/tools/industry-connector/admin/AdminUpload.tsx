"use client";

// Pick a file, see what it would do (checked here with the tool's schema, then
// by the route against what's already loaded), and confirm to upload it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkUpload, type UploadPreview, type UploadProblem } from "@penntools/tool-industry-connector";
import styles from "../IndustryConnector.module.css";

type State =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "problems"; message: string; problems: UploadProblem[] }
  | { step: "preview"; preview: UploadPreview }
  | { step: "uploading"; preview: UploadPreview }
  | { step: "done"; added: number; updated: number };

const ENDPOINT = "/tools/industry-connector/admin/upload";

async function send(mode: "preview" | "apply", text: string, fileName: string): Promise<Response> {
  const params = new URLSearchParams({ mode, fileName });
  return fetch(`${ENDPOINT}?${params}`, { method: "POST", headers: { "content-type": "application/json" }, body: text });
}

export function AdminUpload() {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "idle" });
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);

  const fail = (message: string, problems: UploadProblem[] = []) => setState({ step: "problems", message, problems });

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    setFile(null);
    if (!picked) return setState({ step: "idle" });
    setState({ step: "checking" });
    try {
      const text = await picked.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return fail("The file isn't valid JSON.");
      }
      // Quick check here, so most mistakes show without uploading anything.
      const checked = checkUpload(data);
      if (!checked.ok) return fail("The file has problems, so it can't be uploaded.", checked.problems);

      const res = await send("preview", text, picked.name);
      const body = (await res.json()) as { preview?: UploadPreview; error?: string; problems?: UploadProblem[] };
      if (!res.ok || !body.preview) return fail(body.error ?? "The preview failed.", body.problems);
      setFile({ name: picked.name, text });
      setState({ step: "preview", preview: body.preview });
    } catch {
      fail("Something went wrong. Check your connection and try again.");
    }
  }

  async function confirm() {
    if (!file || state.step !== "preview") return;
    setState({ step: "uploading", preview: state.preview });
    try {
      const res = await send("apply", file.text, file.name);
      const body = (await res.json()) as { result?: { added: number; updated: number }; error?: string; problems?: UploadProblem[] };
      if (!res.ok || !body.result) return fail(body.error ?? "The upload failed. Nothing was changed.", body.problems);
      setState({ step: "done", ...body.result });
      setFile(null);
      router.refresh(); // updates "Last loaded"
    } catch {
      fail("Something went wrong, and the upload may not have finished. Reload the page to see what was loaded.");
    }
  }

  return (
    <section aria-labelledby="upload" className={styles.form}>
      <h2 id="upload" className={styles.subtitle}>Upload a file</h2>
      <label className={styles.field}>
        CareerPath export (.json)
        <input type="file" accept=".json,application/json" onChange={choose} disabled={state.step === "uploading"} />
      </label>

      {state.step === "checking" && <p className={styles.muted}>Checking the file…</p>}

      {state.step === "problems" && (
        <div role="alert">
          <p className={styles.error}>{state.message}</p>
          {state.problems.length > 0 && (
            <ul className={styles.problems}>
              {state.problems.map((p, i) => (
                <li key={i}>
                  {p.position !== undefined && `Entry ${p.position}`}
                  {p.field && ` (${p.field})`}
                  {p.position !== undefined || p.field ? ": " : ""}
                  {p.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(state.step === "preview" || state.step === "uploading") && (
        <div className={styles.draft}>
          <p>
            <strong>{state.preview.people}</strong> people in {file?.name}: <strong>{state.preview.added}</strong> new,{" "}
            <strong>{state.preview.updated}</strong> already loaded (they&apos;ll be updated).
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Industry</th>
                <th>People in file</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(state.preview.perIndustry)
                .sort((a, b) => b[1] - a[1])
                .map(([industry, n]) => (
                  <tr key={industry}>
                    <td>{industry}</td>
                    <td>{n}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={confirm} disabled={state.step === "uploading"}>
              {state.step === "uploading" ? "Uploading…" : `Upload ${state.preview.people} people`}
            </button>
          </div>
        </div>
      )}

      {state.step === "done" && (
        <p className={styles.notice} role="status">
          Uploaded: {state.added} added, {state.updated} updated.
        </p>
      )}
    </section>
  );
}
