"use client";

// The board's interactive parts: a task card (status, owner, waiting on, its
// subtasks) and the form for adding a to-do by hand. Every change calls a
// server action and then refreshes the page, so the server's copy is what shows.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TaskRow, TaskStatus } from "@penntools/tool-pass-it-on";
import styles from "../PassItOn.module.css";
import { addTodoAction, deleteTaskAction, updateTaskAction, type TaskChange } from "./actions";

const STATUS_LABELS: Record<TaskStatus, string> = { todo: "To do", doing: "Doing", blocked: "Blocked", done: "Done", skipped: "Skipped" };
const STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[];

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const call = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      try {
        const result = await fn();
        if (result.ok) router.refresh();
        else setError(result.message ?? "That didn't work.");
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  return { error, pending, call };
}

function SubtaskRow({ task, today }: { task: TaskRow; today: string }) {
  const { error, pending, call } = useAction();
  const finished = task.status === "done" || task.status === "skipped";
  return (
    <li className={styles.subtask}>
      <input
        type="checkbox"
        aria-label={`Mark "${task.title}" done`}
        checked={task.status === "done"}
        disabled={pending}
        onChange={(e) => call(() => updateTaskAction(task.id, { status: e.target.checked ? "done" : "todo" }))}
      />
      <span className={finished ? styles.struck : undefined}>
        {task.title}
        {task.dueDate && <span className={task.dueDate < today && !finished ? styles.overdue : styles.muted}> · {task.dueDate}</span>}
        {task.owner !== "Unassigned" && <span className={styles.muted}> · {task.owner}</span>}
      </span>
      {error && <span className={styles.error}>{error}</span>}
    </li>
  );
}

export function TaskCard({ task, subtasks, today }: { task: TaskRow; subtasks: TaskRow[]; today: string }) {
  const { error, pending, call } = useAction();
  const [owner, setOwner] = useState(task.owner === "Unassigned" ? "" : task.owner);
  const [waitingOn, setWaitingOn] = useState(task.waitingOn ?? "");
  const finished = task.status === "done" || task.status === "skipped";
  const overdue = task.dueDate !== null && task.dueDate < today && !finished;
  const change = (c: TaskChange) => call(() => updateTaskAction(task.id, c));

  return (
    <article className={styles.taskCard}>
      <div className={finished ? styles.struck : styles.taskTitle}>{task.title}</div>
      <div className={styles.muted}>
        {task.eventTitle ?? "Ongoing"}
        {task.dueDate && <span className={overdue ? styles.overdue : undefined}> · due {task.dueDate}</span>}
        {task.timeHint && <span> · {task.timeHint}</span>}
        {task.partner && <span className={styles.tag}>{task.partner}</span>}
      </div>
      {task.notes && <div className={styles.muted}>{task.notes}</div>}
      <label className={styles.compact}>
        Status
        <select className={styles.select} value={task.status} disabled={pending} onChange={(e) => change({ status: e.target.value as TaskStatus })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.compact}>
        Owner
        <input
          className={styles.input}
          list="pass-it-on-members"
          value={owner}
          placeholder="Unassigned"
          disabled={pending}
          onChange={(e) => setOwner(e.target.value)}
          onBlur={() => owner.trim() !== (task.owner === "Unassigned" ? "" : task.owner) && change({ owner })}
        />
      </label>
      {(task.status === "blocked" || task.waitingOn) && (
        <label className={styles.compact}>
          Waiting on
          <input
            className={styles.input}
            value={waitingOn}
            placeholder="A vendor, a partner club..."
            disabled={pending}
            onChange={(e) => setWaitingOn(e.target.value)}
            onBlur={() => waitingOn.trim() !== (task.waitingOn ?? "") && change({ waitingOn })}
          />
        </label>
      )}
      {subtasks.length > 0 && (
        <ul className={styles.subtasks}>
          {subtasks.map((s) => (
            <SubtaskRow key={s.id} task={s} today={today} />
          ))}
        </ul>
      )}
      {task.source === "manual" && (
        <button
          type="button"
          className={styles.danger}
          disabled={pending}
          onClick={() => window.confirm("Delete this to-do?") && call(() => deleteTaskAction(task.id))}
        >
          Delete
        </button>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </article>
  );
}

export function AddTodo({ events }: { events: { id: string; title: string; eventDate: string | null }[] }) {
  const router = useRouter();
  const [values, setValues] = useState({ title: "", owner: "", eventId: "", offsetDays: "", dueDate: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof typeof values) => (e: { target: { value: string } }) => setValues({ ...values, [field]: e.target.value });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await addTodoAction(values);
      if (result.ok) {
        setValues({ title: "", owner: "", eventId: "", offsetDays: "", dueDate: "" });
        router.refresh();
      } else setError(result.message);
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(false);
  }

  return (
    <form
      className={styles.card}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3 className={styles.monthHeading}>Add a to-do</h3>
      <p className={styles.muted}>For things the template doesn't cover: a one-off for one event, or an ongoing job like merch inventory.</p>
      <label className={styles.field}>
        What needs doing
        <input className={styles.input} value={values.title} onChange={set("title")} required />
      </label>
      <label className={styles.field}>
        Owner
        <input className={styles.input} list="pass-it-on-members" value={values.owner} onChange={set("owner")} placeholder="Unassigned" />
      </label>
      <label className={styles.field}>
        For event
        <select className={styles.select} value={values.eventId} onChange={set("eventId")}>
          <option value="">None: an ongoing to-do</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
              {e.eventDate ? ` (${e.eventDate})` : ""}
            </option>
          ))}
        </select>
      </label>
      {values.eventId ? (
        <label className={styles.field}>
          Days from the event (T-3 is -3, T+5 is 5)
          <input className={styles.input} inputMode="numeric" value={values.offsetDays} onChange={set("offsetDays")} placeholder="-3" />
        </label>
      ) : (
        <label className={styles.field}>
          Due date (optional)
          <input className={styles.input} type="date" value={values.dueDate} onChange={set("dueDate")} />
        </label>
      )}
      {error && <div className={styles.error}>{error}</div>}
      <div>
        <button className={styles.button} disabled={busy || values.title.trim() === ""}>
          {busy ? "Adding..." : "Add to-do"}
        </button>
      </div>
    </form>
  );
}
