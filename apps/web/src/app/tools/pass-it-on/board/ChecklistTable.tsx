"use client";

// The checklist: one table per group (ongoing to-dos, then each event). The
// checkbox is the one-click path: its onChange alone saves done/to do. React 18
// has no useOptimistic, so the same behavior is kept in local state: a click
// flips the row at once, a failure rolls it back and shows the error in the row,
// and a response to an older click is ignored so the last click wins.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TaskRow, TaskStatus } from "@penntools/tool-pass-it-on";
import styles from "../PassItOn.module.css";
import { deleteTaskAction, updateTaskAction, type TaskChange } from "./actions";

export interface ChecklistRow {
  task: TaskRow;
  /** 0 for a task, 1 for a subtask shown under its parent. */
  depth: number;
}
export interface ChecklistSection {
  /** "Planning" or "Run of show"; null for the ongoing group, which has no sub-headers. */
  label: string | null;
  rows: ChecklistRow[];
}
export interface ChecklistGroup {
  key: string;
  title: string;
  /** Link to the event; null for ongoing to-dos. */
  href: string | null;
  date: string | null;
  done: number;
  total: number;
  noPubLeader: boolean;
  sections: ChecklistSection[];
}

const STATUS_LABELS: Record<TaskStatus, string> = { todo: "To do", doing: "Doing", blocked: "Blocked", done: "Done", skipped: "Skipped" };
const STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[];

export function ChecklistTable({ groups, today }: { groups: ChecklistGroup[]; today: string }) {
  const router = useRouter();
  // Statuses shown before the server confirms them, and the latest click per task.
  const [shown, setShown] = useState<Record<number, TaskStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Status saves are tracked apart from owner / waiting-on saves, so one kind never hides the other's error.
  const latest = useRef<Record<number, number>>({});
  const inFlight = useRef<Record<number, number>>({});
  // Saves for one task run one after another, so the last click is the last write whatever the framework does.
  const chain = useRef<Record<number, Promise<unknown>>>({});
  const clicks = useRef(0);

  // When fresh server data arrives, drop the shown values for tasks with nothing still saving.
  useEffect(() => {
    setShown((s) => {
      const keep: Record<number, TaskStatus> = {};
      for (const [id, status] of Object.entries(s)) if ((inFlight.current[Number(id)] ?? 0) > 0) keep[Number(id)] = status;
      return Object.keys(keep).length === Object.keys(s).length ? s : keep;
    });
  }, [groups]);

  async function save(task: TaskRow, change: TaskChange) {
    const id = task.id;
    const isStatus = change.status !== undefined;
    const click = ++clicks.current;
    if (isStatus) {
      latest.current[id] = click;
      inFlight.current[id] = (inFlight.current[id] ?? 0) + 1;
      const status = change.status!;
      setShown((s) => ({ ...s, [id]: status }));
    }
    // A new save clears only the error of the same kind (a status error stays until a status save).
    const kind = isStatus ? "status" : "field";
    setErrors((e) => {
      const { [`${id}:${kind}`]: _gone, ...rest } = e;
      return rest;
    });
    const send = async (): Promise<string | null> => {
      try {
        const result = await updateTaskAction(id, change);
        return result.ok ? null : (result.message ?? "That didn't work.");
      } catch {
        return "Something went wrong. Try again.";
      }
    };
    const run = (chain.current[id] ?? Promise.resolve()).then(send);
    chain.current[id] = run;
    const message = await run;
    if (isStatus) {
      inFlight.current[id] = (inFlight.current[id] ?? 1) - 1;
      const isLatest = latest.current[id] === click;
      if (message !== null && isLatest) {
        // A failed older click must not undo a newer one still saving.
        setShown((s) => {
          const { [id]: _gone, ...rest } = s;
          return rest;
        });
        setErrors((e) => ({ ...e, [`${id}:status`]: message }));
      }
      if (isLatest) router.refresh();
    } else {
      if (message !== null) setErrors((e) => ({ ...e, [`${id}:field`]: message }));
      else router.refresh();
    }
  }

  async function remove(task: TaskRow) {
    if (!window.confirm("Delete this to-do?")) return;
    try {
      const result = await deleteTaskAction(task.id);
      if (result.ok) router.refresh();
      else setErrors((e) => ({ ...e, [`${task.id}:field`]: result.message ?? "That didn't work." }));
    } catch {
      setErrors((e) => ({ ...e, [`${task.id}:field`]: "Something went wrong. Try again." }));
    }
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className={styles.card} aria-label={group.title}>
          <div className={styles.groupHeader}>
            <h2 className={styles.heading}>
              {group.href ? (
                <Link href={group.href} className={styles.itemTitle}>
                  {group.title}
                </Link>
              ) : (
                group.title
              )}
              {group.noPubLeader && <span className={styles.flag}>No Pub Leader</span>}
            </h2>
            <span className={styles.muted}>
              {group.date ? `${group.date} · ` : ""}
              {group.done} of {group.total} done
            </span>
            {group.total > 0 && <progress className={styles.progress} value={group.done} max={group.total} aria-label={`${group.title}: ${group.done} of ${group.total} tasks done`} />}
          </div>
          <table className={styles.checklistTable}>
            <thead>
              <tr>
                <th scope="col">
                  <span className={styles.srOnly}>Done</span>
                  <span aria-hidden="true">✓</span>
                </th>
                <th scope="col">Task</th>
                <th scope="col">Due</th>
                <th scope="col">Owner</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            {group.sections.map((section) => (
              <tbody key={section.label ?? "all"}>
                {section.label && (
                  <tr className={styles.subHeader}>
                    <th scope="colgroup" colSpan={5}>
                      {section.label}
                    </th>
                  </tr>
                )}
                {section.rows.map(({ task, depth }) => (
                  <Row key={task.id} task={task} depth={depth} today={today} status={shown[task.id] ?? task.status} error={[errors[`${task.id}:status`], errors[`${task.id}:field`]].filter(Boolean).join(" ") || undefined} save={save} remove={remove} />
                ))}
              </tbody>
            ))}
          </table>
        </section>
      ))}
    </>
  );
}

function Row({
  task,
  depth,
  today,
  status,
  error,
  save,
  remove,
}: {
  task: TaskRow;
  depth: number;
  today: string;
  status: TaskStatus;
  error: string | undefined;
  save: (task: TaskRow, change: TaskChange) => Promise<void>;
  remove: (task: TaskRow) => Promise<void>;
}) {
  const finished = status === "done" || status === "skipped";
  const overdue = task.dueDate !== null && task.dueDate < today && !finished;
  const ownerNow = task.owner === "Unassigned" ? "" : task.owner;
  const [blockedOpen, setBlockedOpen] = useState(false);
  const showWaiting = status === "blocked" || blockedOpen || !!task.waitingOn;
  const detail = [task.notes, task.partner, task.timeHint].filter((x): x is string => !!x);
  const isEquipment = (task.templateItemKey ?? "").startsWith("equipment");

  return (
    <>
      <tr className={`${depth > 0 ? styles.subRow : ""} ${finished ? styles.rowDone : ""}`.trim()}>
        <td className={styles.checkCell} data-label="Done">
          <label className={styles.checkLabel}>
            <input type="checkbox" className={styles.bigCheck} aria-label={`Mark "${task.title}" done`} checked={status === "done"} onChange={(e) => void save(task, { status: e.target.checked ? "done" : "todo" })} />
          </label>
        </td>
        <td className={styles.taskCell} data-label="Task">
          <div className={styles.taskName}>{task.title}</div>
          {detail.length > 0 && <div className={styles.muted}>{detail.join(" · ")}</div>}
          {isEquipment && <div className={styles.muted}>Remove by editing the event&apos;s equipment list.</div>}
          {task.waitingOn && status === "blocked" && <div className={styles.muted}>Waiting on {task.waitingOn}</div>}
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
        </td>
        <td data-label="Due" className={overdue ? styles.overdue : styles.muted}>
          {task.dueDate ?? "No date"}
        </td>
        <td data-label="Owner">
          <input
            key={ownerNow}
            className={styles.cellInput}
            list="pass-it-on-members"
            defaultValue={ownerNow}
            placeholder="Unassigned"
            aria-label={`Owner of "${task.title}"`}
            onBlur={(e) => e.target.value.trim() !== ownerNow && void save(task, { owner: e.target.value })}
          />
        </td>
        <td data-label="Status">
          <select
            className={styles.select}
            value={status}
            aria-label={`Status of "${task.title}"`}
            onChange={(e) => {
              const next = e.target.value as TaskStatus;
              setBlockedOpen(next === "blocked");
              void save(task, { status: next });
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {showWaiting && (
            <input
              key={task.waitingOn ?? ""}
              className={styles.cellInput}
              defaultValue={task.waitingOn ?? ""}
              placeholder="Waiting on..."
              aria-label={`Waiting on, for "${task.title}"`}
              onBlur={(e) => e.target.value.trim() !== (task.waitingOn ?? "") && void save(task, { waitingOn: e.target.value })}
            />
          )}
          {task.source === "manual" && !isEquipment && (
            <button type="button" className={styles.danger} onClick={() => void remove(task)}>
              Delete
            </button>
          )}
        </td>
      </tr>
    </>
  );
}
