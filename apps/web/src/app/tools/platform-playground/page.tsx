"use client";
import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type NavItem = "playground" | "api-reference";

type UserResponse = { id: string; type: string; name: string | null; pennId: string | null };
type LlmResponse = { content: string; model: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } };

type ApiState<T> = { status: "idle" | "loading" | "success" | "error"; data: T | null; error: string | null };

function idle<T>(): ApiState<T> {
  return { status: "idle", data: null, error: null };
}

// ── Shared style ───────────────────────────────────────────────────────────────

const prose: React.CSSProperties = {
  color: "#4b5563",
  fontSize: 14,
  lineHeight: 1.7,
  margin: "0 0 16px",
};

// ── Page component ─────────────────────────────────────────────────────────────

export default function PlatformPlaygroundPage() {
  const [activeNav, setActiveNav] = useState<NavItem>("playground");
  const [userApi, setUserApi] = useState<ApiState<UserResponse>>(idle());
  const [llmApi, setLlmApi] = useState<ApiState<LlmResponse>>(idle());
  const [llmPrompt, setLlmPrompt] = useState("");

  async function runUserApi() {
    setUserApi({ status: "loading", data: null, error: null });
    try {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: UserResponse = await res.json();
      setUserApi({ status: "success", data, error: null });
    } catch (err) {
      setUserApi({ status: "error", data: null, error: String(err) });
    }
  }

  async function runLlmApi() {
    if (!llmPrompt.trim()) return;
    setLlmApi({ status: "loading", data: null, error: null });
    try {
      const storedKey = typeof window !== "undefined" ? (localStorage.getItem("penntools_api_key") ?? "") : "";
      const res = await fetch("/api/llm/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedKey ? { "X-Api-Key": storedKey } : {}),
        },
        body: JSON.stringify({ prompt: llmPrompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LlmResponse = await res.json();
      setLlmApi({ status: "success", data, error: null });
    } catch (err) {
      setLlmApi({ status: "error", data: null, error: String(err) });
    }
  }

  const NAV_ITEMS: Array<{ id: NavItem; label: string; render: () => React.ReactNode }> = [
    {
      id: "playground",
      label: "Playground",
      render: () => (
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", color: "#0d0d0d" }}>Playground</h2>
          <p style={{ ...prose, marginBottom: 28 }}>
            Try the platform APIs below. Use these in your tool to get user info or call an AI model.
          </p>
          <ApiCard
            title="User API"
            description="Get the logged-in user's name and ID."
            usagePrompt="Implement User API and refer to the platform playground implementation for guidance."
            apiState={userApi}
            onRun={runUserApi}
            renderResult={(data) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <LabeledRow label="ID" value={data.id} />
                <LabeledRow label="Type" value={data.type} />
                <LabeledRow label="Name" value={data.name} nullable />
                <LabeledRow label="Penn ID" value={data.pennId} nullable />
              </div>
            )}
          />
          <LlmCard
            prompt={llmPrompt}
            onPromptChange={setLlmPrompt}
            onSend={runLlmApi}
            apiState={llmApi}
          />
        </div>
      ),
    },
    {
      id: "api-reference",
      label: "API Reference",
      render: () => (
        <div>
          <header style={{ marginBottom: 48 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "#011F5B",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Platform Team
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: "#0d0d0d" }}>
              Platform API Reference
            </h1>
            <p style={{ color: "#6e6e80", fontSize: 15, margin: 0, lineHeight: 1.6, maxWidth: 580 }}>
              Two APIs are available to your tool: <strong>User API</strong> and <strong>LLM API</strong>.
              Your <Code>execute(input, context)</Code> method receives these via <Code>ToolContext</Code> — import
              nothing from <Code>@penntools/platform</Code> or env vars directly.
            </p>
          </header>

          <Section title="User API" badge="context.currentUser" badgeColor="#2d7a4f">
            <p style={prose}>
              Get the logged-in user{"'"}s name and ID. Access via <Code>context.currentUser</Code> in your tool{"'"}s backend,
              or call <Code>GET /api/me</Code> from your landing page.
            </p>
            <CodeBlock>{`// Backend — in your execute() method
const user = context.currentUser;
// user.id     — stable UUID
// user.name   — display name (null until SSO)
// user.pennId — Penn ID (null until SSO)
// user.type   — "anonymous" | "authenticated"`}</CodeBlock>
            <UsageExample>{`// Frontend — in your landing page
const res = await fetch("/api/me");
const user = await res.json();
// { id, type, name, pennId }`}</UsageExample>
          </Section>

          <Section title="LLM API" badge="context.llm" badgeColor="#1a56a4">
            <p style={prose}>
              Send text input from the user and receive text output from an AI model.
              Supports OpenAI and Anthropic. Use <Code>context.llm.complete()</Code> in your tool{"'"}s backend,
              or call <Code>POST /api/llm/complete</Code> from your landing page.
            </p>
            <CodeBlock>{`// Backend — in your execute() method
const res = await context.llm.complete({
  messages: [{ role: "user", content: input.prompt }],
  systemPrompt: "You are a helpful Penn assistant.",
  temperature: 0.7,
});
// res.content — the AI response text
// res.model   — model used
// res.usage   — { promptTokens, completionTokens, totalTokens }`}</CodeBlock>
            <UsageExample>{`// Frontend — in your landing page
const res = await fetch("/api/llm/complete", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "Hello!" }),
});
const data = await res.json();
// { content, model, usage }`}</UsageExample>
          </Section>

          <Section title="Tool Base Class" badge="@penntools/core/tools" badgeColor="#011F5B">
            <p style={prose}>
              Every tool extends <Code>Tool{"<I, O>"}</Code> and implements two members.
            </p>
            <CodeBlock>{`abstract class Tool<I = unknown, O extends ToolOutput = ToolOutput> {
  abstract readonly manifest: ToolManifest;
  abstract execute(input: I, context: ToolContext): Promise<O>;

  // Override to restrict access by userId (default: allow all)
  canAccess(_userId: UserId): boolean { return true; }
}

interface ToolOutput {
  assistantMessage: string;      // required — shown in chat thread
  artifacts?:       Artifact[];  // optional rich output
  telemetry?:       ToolTelemetry;
}

interface ToolTelemetry {
  durationMs:  number;
  tokensUsed?: number;
  meta?:       Record<string, unknown>;
}

interface Artifact {
  kind:  "text" | "json" | "link" | "image";
  label: string;
  data:  any;
}

interface ToolManifest {
  id:                string;   // stable kebab-case; never change after ship
  title:             string;
  description:       string;
  image:             string;   // relative path or URL
  contributors:      string[];
  mentor?:           string;
  version:           string;   // semver
  inceptionDate:     string;   // ISO date
  latestReleaseDate: string;   // ISO date
}`}</CodeBlock>
          </Section>
        </div>
      ),
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        background: "var(--bg, #fff)",
        borderTop: "1px solid #e5e5e5",
      }}
    >
      {/* Left nav — never scrolls */}
      <nav
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid #e5e5e5",
          padding: "56px 0 32px",
        }}
      >
        <div style={{ padding: "0 16px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af" }}>
          Platform Playground
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === activeNav;
          return (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "9px 20px",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#011F5B" : "#374151",
                background: isActive ? "#f0f4ff" : "transparent",
                border: "none",
                borderLeft: isActive ? "3px solid #011F5B" : "3px solid transparent",
                cursor: "pointer",
                marginBottom: 1,
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Right panel — only this scrolls when content overflows */}
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "48px 48px 80px" }}>
        {NAV_ITEMS.find((item) => item.id === activeNav)?.render()}
      </main>
    </div>
  );
}

// ── ApiCard ────────────────────────────────────────────────────────────────────

function CopyPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#f5f7ff",
        border: "1px solid #dce3ff",
        borderRadius: 6,
        padding: "8px 12px",
        marginBottom: 14,
      }}
    >
      <span style={{ fontSize: 12, color: "#6b7280", flexShrink: 0, fontWeight: 600 }}>Ask your agent:</span>
      <span
        style={{
          fontSize: 12,
          color: "#1e3a8a",
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
      <button
        onClick={handleCopy}
        style={{
          flexShrink: 0,
          background: copied ? "#dcfce7" : "#fff",
          border: `1px solid ${copied ? "#86efac" : "#d1d5db"}`,
          borderRadius: 4,
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: copied ? "#166534" : "#374151",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function ApiCard<T>({
  title,
  description,
  usagePrompt,
  apiState,
  onRun,
  renderResult,
}: {
  title: string;
  description: string;
  usagePrompt: string;
  apiState: ApiState<T>;
  onRun: () => void;
  renderResult: (data: T) => React.ReactNode;
}) {
  const isLoading = apiState.status === "loading";
  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 10,
        padding: "20px 22px",
        marginBottom: 20,
        background: "#fff",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#0d0d0d" }}>{title}</span>
        <button
          onClick={onRun}
          disabled={isLoading}
          style={{
            marginLeft: "auto",
            background: "#011F5B",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? "Running…" : "Run"}
        </button>
      </div>

      {/* Description */}
      <p style={{ ...prose, marginBottom: 10 }}>{description}</p>

      {/* Copyable usage prompt */}
      <CopyPrompt text={usagePrompt} />

      {/* Result panel */}
      {apiState.status === "loading" && (
        <p style={{ color: "#9ca3af", fontSize: 13, margin: "4px 0 0" }}>Running…</p>
      )}
      {apiState.status === "error" && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 13,
            color: "#b91c1c",
          }}
        >
          {apiState.error}
        </div>
      )}
      {apiState.status === "success" && apiState.data !== null && (
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            padding: "12px 16px",
          }}
        >
          {renderResult(apiState.data)}
        </div>
      )}
    </div>
  );
}

// ── LlmCard ────────────────────────────────────────────────────────────────────

function LlmCard({
  prompt,
  onPromptChange,
  onSend,
  apiState,
}: {
  prompt: string;
  onPromptChange: (val: string) => void;
  onSend: () => void;
  apiState: ApiState<LlmResponse>;
}) {
  const isLoading = apiState.status === "loading";
  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 10,
        padding: "20px 22px",
        marginBottom: 20,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#0d0d0d" }}>LLM API</span>
      </div>
      <p style={{ ...prose, marginBottom: 10 }}>
        Send text input from the user and receive text output from an AI model.
      </p>
      <CopyPrompt text="Implement LLM API and refer to the platform playground implementation for guidance." />
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Type a prompt…"
        rows={3}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 12px",
          borderRadius: 7,
          border: "1px solid #d1d5db",
          fontSize: 13,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          marginBottom: 10,
          color: "#111827",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: apiState.status === "idle" ? 0 : 14 }}>
        <button
          onClick={onSend}
          disabled={isLoading || !prompt.trim()}
          style={{
            background: "#011F5B",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: isLoading || !prompt.trim() ? "not-allowed" : "pointer",
            opacity: isLoading || !prompt.trim() ? 0.6 : 1,
          }}
        >
          {isLoading ? "Sending…" : "Send"}
        </button>
      </div>
      {apiState.status === "loading" && (
        <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>Waiting for response…</p>
      )}
      {apiState.status === "error" && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 13,
            color: "#b91c1c",
          }}
        >
          {apiState.error}
        </div>
      )}
      {apiState.status === "success" && apiState.data && (
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            padding: "12px 16px",
          }}
        >
          <p style={{ fontSize: 13, color: "#111827", margin: "0 0 10px", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {apiState.data.content}
          </p>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#9ca3af", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
            <span>model: <span style={{ fontFamily: "ui-monospace, monospace" }}>{apiState.data.model}</span></span>
            <span>tokens: {apiState.data.usage.totalTokens}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LabeledRow ─────────────────────────────────────────────────────────────────

function LabeledRow({ label, value, nullable }: { label: string; value: string | null; nullable?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
      <span style={{ color: "#6b7280", width: 72, flexShrink: 0 }}>{label}</span>
      {value === null && nullable ? (
        <em style={{ color: "#9ca3af" }}>null</em>
      ) : (
        <span style={{ color: "#111827", fontFamily: "ui-monospace, monospace" }}>{value}</span>
      )}
    </div>
  );
}

// ── Presentational helpers (unchanged) ─────────────────────────────────────────

function Section({
  title,
  badge,
  badgeColor,
  children,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#0d0d0d" }}>{title}</h2>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            color: "#fff",
            background: badgeColor,
            borderRadius: 4,
            padding: "2px 8px",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {badge}
        </span>
      </div>
      {children}
      <hr style={{ border: "none", borderTop: "1px solid #e5e5e5", margin: "32px 0 0" }} />
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        fontSize: "0.85em",
        background: "#f3f4f6",
        border: "1px solid #e5e7eb",
        borderRadius: 3,
        padding: "1px 5px",
        color: "#374151",
      }}
    >
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "#f8f9fa",
        border: "1px solid #e5e5e5",
        borderRadius: 8,
        padding: "18px 20px",
        fontSize: 13,
        lineHeight: 1.65,
        overflowX: "auto",
        margin: "0 0 16px",
        color: "#1a1a2e",
        fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
      }}
    >
      {children}
    </pre>
  );
}

function UsageExample({ children }: { children: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#8e8ea0",
          marginBottom: 6,
        }}
      >
        Example
      </div>
      <pre
        style={{
          background: "#0d1117",
          color: "#c9d1d9",
          borderRadius: 8,
          padding: "18px 20px",
          fontSize: 13,
          lineHeight: 1.65,
          overflowX: "auto",
          margin: "0 0 16px",
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        }}
      >
        {children}
      </pre>
    </div>
  );
}

function CalloutBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        borderLeft: "4px solid #011F5B",
        borderRadius: 6,
        padding: "12px 16px",
        fontSize: 13,
        color: "#1e3a5f",
        lineHeight: 1.6,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}
