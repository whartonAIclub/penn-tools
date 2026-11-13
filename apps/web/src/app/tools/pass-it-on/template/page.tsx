// The Template tab: the checklist every event is generated from, in two
// sections (Planning and Run of show), the known issues the Pub leader still
// has to decide, and the versions, with a way back to an older one.

import Link from "next/link";
import { categoryOf, describeTiming, getTemplate, listTemplateVersions, type TemplateItem } from "@penntools/tool-pass-it-on";
import { db } from "../db";
import styles from "../PassItOn.module.css";
import { IssueButton, RevertButton } from "./TemplateActions";

const AREA_LABELS: Record<string, string> = {
  general: "General",
  finance: "Finance",
  marketing: "Marketing",
  operations: "Operations",
  entertainment: "Entertainment",
  partners: "Partners",
};

const SECTIONS = [
  { key: "planning", label: "Planning" },
  { key: "run_of_show", label: "Run of show" },
] as const;

export default async function TemplatePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const raw = Array.isArray(searchParams["v"]) ? searchParams["v"][0] : searchParams["v"];
  const requested = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : undefined;
  const [versions, template] = await Promise.all([listTemplateVersions(db()), getTemplate(db(), requested)]);

  if (!template) {
    return (
      <section className={styles.card}>
        <p className={styles.muted}>
          The template is created the first time an event gets a checklist. <Link href="/tools/pass-it-on/events/new" className={styles.link}>Add an event</Link> to start.
        </p>
      </section>
    );
  }

  const latest = versions[0]?.versionId === template.versionId;
  const moduleName = (key: string | null) => (key === null ? "Every event" : (template.modules.find((m) => m.key === key)?.name ?? key));
  const children = (key: string) => template.items.filter((i) => i.parentKey === key);
  const row = (item: TemplateItem, depth: number): React.ReactNode => (
    <li key={item.key} className={depth > 0 ? styles.subtask : styles.templateItem}>
      <span className={styles.timing}>{describeTiming(item)}</span>
      <span>
        {item.title}
        <span className={styles.tag}>{AREA_LABELS[item.area] ?? item.area}</span>
        {item.repeatFor && <span className={styles.tag}>per partner club</span>}
        {item.timeHint && <span className={styles.muted}> · {item.timeHint}</span>}
        {item.notes && <span className={styles.muted}> — {item.notes}</span>}
      </span>
      {depth === 0 && children(item.key).length > 0 && <ul className={styles.subtasks}>{children(item.key).map((c) => row(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <>
      <section className={styles.card}>
        <div className={styles.spread}>
          <h2 className={styles.heading}>
            Template, version {template.version}
            {!latest && <span className={styles.tag}>older version</span>}
          </h2>
          {!latest && <RevertButton versionId={template.versionId} version={template.version} />}
        </div>
        {template.note && <p className={styles.muted}>{template.note}</p>}
        {!latest && (
          <p className={styles.muted}>
            You're looking at an older version. <Link href="/tools/pass-it-on/template" className={styles.link}>Back to the latest</Link>.
          </p>
        )}
      </section>

      {template.issues.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.heading}>Known issues</h2>
          <ul className={styles.list}>
            {template.issues.map((issue) => (
              <li key={issue.id} className={styles.item}>
                <span className={issue.status === "open" ? styles.warning : styles.muted}>
                  {issue.status === "resolved" && <span className={styles.tag}>Resolved</span>} {issue.text}
                  {issue.itemKey && <span className={styles.muted}> (item: {template.items.find((i) => i.key === issue.itemKey)?.title ?? issue.itemKey})</span>}
                </span>
                {latest && (
                  <span>
                    <IssueButton issueId={issue.id} status={issue.status} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {SECTIONS.map((section) => {
        const inSection = template.items.filter((i) => i.parentKey === null && categoryOf(i.phase) === section.key);
        const groups = [null, ...template.modules.map((m) => m.key)].filter((k) => inSection.some((i) => i.moduleKey === k));
        return (
          <section key={section.key} className={styles.card}>
            <h2 className={styles.heading}>{section.label}</h2>
            {groups.length === 0 && <p className={styles.muted}>Nothing here yet.</p>}
            {groups.map((moduleKey) => (
              <div key={moduleKey ?? "base"}>
                <h3 className={styles.monthHeading}>{moduleName(moduleKey)}</h3>
                <ul className={styles.templateList}>
                  {inSection
                    .filter((i) => i.moduleKey === moduleKey)
                    .sort((a, b) => (a.offsetDays ?? 1e6) - (b.offsetDays ?? 1e6) || a.sort - b.sort)
                    .map((i) => row(i, 0))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}

      <section className={styles.card}>
        <h2 className={styles.heading}>Versions</h2>
        <ul className={styles.list}>
          {versions.map((v) => (
            <li key={v.versionId} className={styles.item}>
              <Link href={v.versionId === versions[0]!.versionId ? "/tools/pass-it-on/template" : `/tools/pass-it-on/template?v=${v.versionId}`} className={styles.itemTitle}>
                Version {v.version}
                {v.versionId === template.versionId && " (shown)"}
              </Link>
              <span className={styles.muted}>
                {v.createdAt.slice(0, 10)} · {v.items} items{v.note ? ` · ${v.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
