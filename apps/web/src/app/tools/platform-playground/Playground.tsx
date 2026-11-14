"use client";

// The Playground's cards. Each one calls a server action in actions.ts, which
// calls a function in tools/platform-playground/src/demos.ts.

import { useState } from "react";
import Link from "next/link";
import type { AIProvider, GenerateResult } from "@penntools/core/ai";
import type { ScoredResource, SyllabusTasks } from "@penntools/tool-platform-playground";
import { extract, generate, search, type DemoError, type DemoResult } from "./actions";
import styles from "./Playground.module.css";

type Status<T> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done"; data: T }
  | { state: "error"; error: DemoError };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit", "credit_used"]);

/** Runs a server action and tracks its status. If the call itself fails (e.g. offline), that's an error too. */
function useDemo<T>() {
  const [status, setStatus] = useState<Status<T>>({ state: "idle" });
  async function run(action: () => Promise<DemoResult<T>>) {
    setStatus({ state: "loading" });
    try {
      const result = await action();
      setStatus(result.ok ? { state: "done", data: result.data } : { state: "error", error: result.error });
    } catch {
      setStatus({ state: "error", error: { message: "Something went wrong. Try again." } });
    }
  }
  return [status, run] as const;
}

export function Playground({
  providers,
  labels,
  sampleSyllabus,
  limits,
}: {
  /** Providers the user can call (ai.providers()); never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  sampleSyllabus: string;
  limits: { prompt: number; syllabus: number; query: number };
}) {
  const [provider, setProvider] = useState(providers[0]!);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Platform Playground</h1>
      <p className={styles.intro}>
        Working examples of the platform APIs, running on your free AI credit and then your own API keys. Each
        card&apos;s logic is in{" "}
        <code>tools/platform-playground/src/demos.ts</code> and its server action in <code>actions.ts</code>. For
        streaming, chat history and a tool&apos;s own database, see{" "}
        <Link href="/tools/askpenn" className={styles.link}>
          AskPenn
        </Link>
        .
      </p>

      {providers.length > 1 ? (
        <label className={styles.provider}>
          Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
            {providers.map((p) => (
              <option key={p} value={p}>
                {labels[p]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className={styles.providerNote}>
          Provider: {labels[provider]} (add another key in{" "}
          <Link href="/settings" className={styles.link}>
            Settings
          </Link>{" "}
          to switch)
        </p>
      )}

      <UserCard />
      <GenerateCard provider={provider} maxLength={limits.prompt} />
      <ExtractCard provider={provider} sampleSyllabus={sampleSyllabus} maxLength={limits.syllabus} />
      <SearchCard maxLength={limits.query} />
    </div>
  );
}

// ── User API ───────────────────────────────────────────────────────────────────

type Me = { id: string; name: string | null; email: string | null };

function UserCard() {
  const [status, run] = useDemo<Me>();

  // GET /api/me is the User API for pages; server code calls getCurrentUser() from @/lib/auth.
  const load = () =>
    run(async () => {
      const res = await fetch("/api/me");
      if (res.status === 401) return { ok: false, error: { message: "Sign in with the button at the top right." } };
      if (!res.ok) return { ok: false, error: { message: `Request failed (HTTP ${res.status}).` } };
      return { ok: true, data: (await res.json()) as Me };
    });

  return (
    <Card
      title="User API"
      description="Who's signed in. Pages call GET /api/me; routes and server actions call getCurrentUser()."
      prompt="Implement User API and refer to the platform playground implementation for guidance."
      code="UserCard in apps/web/src/app/tools/platform-playground/Playground.tsx"
    >
      <button className={styles.button} onClick={() => void load()} disabled={status.state === "loading"}>
        {status.state === "loading" ? "Loading…" : "Show me"}
      </button>
      <Outcome status={status}>
        {(me) => (
          <dl className={styles.fields}>
            <dt>ID</dt>
            <dd>{me.id}</dd>
            <dt>Name</dt>
            <dd>{me.name ?? "—"}</dd>
            <dt>Email</dt>
            <dd>{me.email ?? "—"}</dd>
          </dl>
        )}
      </Outcome>
    </Card>
  );
}

// ── Generate text ──────────────────────────────────────────────────────────────

function GenerateCard({ provider, maxLength }: { provider: AIProvider; maxLength: number }) {
  const [prompt, setPrompt] = useState("Explain what a discounted cash flow model is, in three sentences.");
  const [status, run] = useDemo<GenerateResult>();

  return (
    <Card
      title="Generate text"
      description="One reply to one prompt with ai.generate(), from a server action."
      prompt="Implement AI API and refer to the platform playground implementation for guidance."
      code="generateAnswer in demos.ts, generate in actions.ts"
    >
      <textarea aria-label="Prompt" className={styles.textarea} rows={3} value={prompt} maxLength={maxLength} onChange={(e) => setPrompt(e.target.value)} />
      <button
        className={styles.button}
        onClick={() => void run(() => generate(provider, prompt))}
        disabled={status.state === "loading" || !prompt.trim()}
      >
        {status.state === "loading" ? "Generating…" : "Generate"}
      </button>
      <Outcome status={status}>
        {(result) => (
          <>
            <p className={styles.reply}>{result.text}</p>
            <p className={styles.meta}>
              {result.model} · {result.usage.inputTokens} in / {result.usage.outputTokens} out
              {result.usage.reasoningTokens > 0 && ` (${result.usage.reasoningTokens} reasoning)`} · stop reason:{" "}
              {result.stopReason}
            </p>
          </>
        )}
      </Outcome>
    </Card>
  );
}

// ── Structured output ──────────────────────────────────────────────────────────

function ExtractCard({
  provider,
  sampleSyllabus,
  maxLength,
}: {
  provider: AIProvider;
  sampleSyllabus: string;
  maxLength: number;
}) {
  const [syllabus, setSyllabus] = useState(sampleSyllabus);
  const [status, run] = useDemo<SyllabusTasks>();

  return (
    <Card
      title="Structured output"
      description="Typed data instead of text, with ai.generateObject() and a Zod schema. The reply is checked against the schema before it reaches you."
      prompt="Implement structured output with the AI API and refer to the platform playground implementation for guidance."
      code="SyllabusTasks and extractTasks in demos.ts, extract in actions.ts"
    >
      <textarea aria-label="Syllabus" className={styles.textarea} rows={7} value={syllabus} maxLength={maxLength} onChange={(e) => setSyllabus(e.target.value)} />
      <button
        className={styles.button}
        onClick={() => void run(() => extract(provider, syllabus))}
        disabled={status.state === "loading" || !syllabus.trim()}
      >
        {status.state === "loading" ? "Extracting…" : "Extract tasks"}
      </button>
      <Outcome status={status}>
        {({ tasks }) =>
          tasks.length === 0 ? (
            <p className={styles.meta}>No tasks found.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Type</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, i) => (
                  <tr key={i}>
                    <td>{task.title}</td>
                    <td>{task.type}</td>
                    <td>{task.dueDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Outcome>
    </Card>
  );
}

// ── Semantic search ────────────────────────────────────────────────────────────

function SearchCard({ maxLength }: { maxLength: number }) {
  const [query, setQuery] = useState("help preparing for interviews");
  const [status, run] = useDemo<ScoredResource[]>();
  const canSearch = status.state !== "loading" && query.trim() !== "";
  const runSearch = () => void run(() => search(query));

  return (
    <Card
      title="Semantic search"
      description="Rank 8 made-up resources by meaning, not keywords, with getEmbeddings(). Embeddings always use OpenAI: your key if you've saved one, otherwise the platform's."
      prompt="Implement Embeddings API and refer to the platform playground implementation for guidance."
      code="searchResources in demos.ts, search in actions.ts"
    >
      <div className={styles.row}>
        <input
          aria-label="Search"
          className={styles.input}
          value={query}
          maxLength={maxLength}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSearch && runSearch()}
        />
        <button className={styles.button} onClick={runSearch} disabled={!canSearch}>
          {status.state === "loading" ? "Searching…" : "Search"}
        </button>
      </div>
      <Outcome status={status}>
        {(results) => (
          <ol className={styles.results}>
            {results.map((r) => (
              <li key={r.title}>
                <span className={styles.score}>{r.score.toFixed(2)}</span>
                <span>
                  <strong>{r.title}</strong> — {r.description}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Outcome>
    </Card>
  );
}

// ── Shared pieces ──────────────────────────────────────────────────────────────

function Card({
  title,
  description,
  prompt,
  code,
  children,
}: {
  title: string;
  description: string;
  prompt: string;
  code: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(prompt).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {},
    );
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <p className={styles.description}>{description}</p>
      <div className={styles.prompt}>
        <span className={styles.promptLabel}>Ask your agent:</span>
        <span className={styles.promptText}>{prompt}</span>
        <button className={styles.copy} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className={styles.code}>Code: {code}</p>
      {children}
    </section>
  );
}

/** A finished demo's result, or its error (with a Settings link for key problems). */
function Outcome<T>({ status, children }: { status: Status<T>; children: (data: T) => React.ReactNode }) {
  if (status.state === "done") return <div className={styles.result}>{children(status.data)}</div>;
  if (status.state !== "error") return null;
  return (
    <p className={styles.error}>
      {status.error.message}
      {status.error.kind && KEY_PROBLEMS.has(status.error.kind) && (
        <>
          {" "}
          <Link href="/settings" className={styles.link}>
            Open Settings
          </Link>
        </>
      )}
    </p>
  );
}
