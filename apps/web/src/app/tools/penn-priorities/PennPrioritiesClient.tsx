"use client";

import { useEffect, useMemo, useState } from "react";

type Category = "career" | "academic" | "social";
type Status = "notstarted" | "inprogress" | "done";
type DerivedStatus = Status | "overdue";
type Priority = "high" | "medium" | "low";
type SortMode = "smart" | "date" | "priority" | "category";
type FilterMode = "all" | Category | "overdue" | "inprogress" | "done";

type TaskItem = {
  id: number;
  cat: Category;
  text: string;
  status: Status;
  date: string;
  priority: Priority;
  timeEst: string;
  label: string;
  notes: string;
};

type Settings = {
  showDone: boolean;
  showNotes: boolean;
  sortMode: SortMode;
  rankCareer: number;
  rankAcademic: number;
  rankSocial: number;
};

type Command = {
  ico: "add" | "book" | "net" | "clear" | "all" | "settings";
  lbl: string;
  sub: string;
  fn: () => void;
};

const SETTINGS_KEY = "qt1_settings";
const ITEMS_KEY = "qt1_items";
const DEFAULT_SETTINGS: Settings = {
  showDone: true,
  showNotes: true,
  sortMode: "smart",
  rankCareer: 1,
  rankAcademic: 2,
  rankSocial: 3,
};

function getTodayDate(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateIn(n: number): string {
  const d = getTodayDate();
  d.setDate(d.getDate() + n);
  return dateToIso(d);
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysApart(s: string): number {
  return Math.round((parseDate(s).getTime() - getTodayDate().getTime()) / 86400000);
}

function formatDisplayDate(s: string): string {
  if (!s) return "";
  return parseDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(mins: string): string {
  if (!mins) return "";
  const m = Number(mins);
  if (m < 60) return `${m}m`;
  if (m % 60 === 0) return `${m / 60}h`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

function capitalize(s: string): string {
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : "";
}

function seedItems(): TaskItem[] {
  return [
    { id: 1, cat: "career", text: "Prepare for Goldman Sachs info session", status: "inprogress", date: dateIn(2), priority: "high", timeEst: "60", label: "GS", notes: "Review firm overview and recent deals" },
    { id: 2, cat: "career", text: "McKinsey first-round application", status: "notstarted", date: dateIn(4), priority: "high", timeEst: "120", label: "MBB", notes: "Cover letter + resume polish needed" },
    { id: 3, cat: "career", text: "Update LinkedIn with spring internship", status: "notstarted", date: dateIn(9), priority: "low", timeEst: "30", label: "", notes: "" },
    { id: 4, cat: "career", text: "Research Deloitte practice areas", status: "done", date: dateIn(2), priority: "medium", timeEst: "45", label: "Deloitte", notes: "" },
    { id: 5, cat: "academic", text: "Finance midterm - review chapters 5-9", status: "inprogress", date: dateIn(1), priority: "high", timeEst: "180", label: "FNCE 611", notes: "Focus on DCF and WACC sections" },
    { id: 6, cat: "academic", text: "Accounting problem set", status: "notstarted", date: dateIn(2), priority: "high", timeEst: "90", label: "ACCT 621", notes: "Problems 4-12 only" },
    { id: 7, cat: "academic", text: "Ethics essay first draft", status: "done", date: dateIn(5), priority: "medium", timeEst: "120", label: "LGST 801", notes: "" },
    { id: 8, cat: "academic", text: "Strategy case study group prep", status: "notstarted", date: dateIn(3), priority: "medium", timeEst: "60", label: "MGMT 691", notes: "Meeting in Huntsman 246" },
    { id: 9, cat: "social", text: "Send thank-you note to Jane Kim (Blackstone)", status: "notstarted", date: dateIn(1), priority: "high", timeEst: "15", label: "Blackstone", notes: "Coffee chat follow-up - mention Infra team" },
    { id: 10, cat: "social", text: "Attend BCG networking event", status: "notstarted", date: dateIn(5), priority: "high", timeEst: "90", label: "BCG", notes: "Huntsman Hall - 5 PM" },
    { id: 11, cat: "social", text: "Reach out to alum at Citadel", status: "notstarted", date: dateIn(7), priority: "medium", timeEst: "15", label: "Penn Mentor", notes: "Found via Penn Mentor Network" },
    { id: 12, cat: "social", text: "RSVP to Wharton Finance Club dinner", status: "done", date: dateIn(3), priority: "low", timeEst: "5", label: "WFC", notes: "" },
  ];
}

function computeStatus(item: TaskItem): DerivedStatus {
  if (item.status === "done") return "done";
  if (item.date && daysApart(item.date) < 0) return "overdue";
  return item.status || "notstarted";
}

const statusMeta: Record<DerivedStatus, { label: string; cls: string; dotColor: string }> = {
  overdue: { label: "Overdue", cls: "overdue", dotColor: "var(--s-overdue-dot)" },
  inprogress: { label: "In Progress", cls: "inprogress", dotColor: "var(--s-inprog-dot)" },
  notstarted: { label: "Not Started", cls: "notstarted", dotColor: "var(--s-notstart-dot)" },
  done: { label: "Done", cls: "done", dotColor: "var(--s-done-dot)" },
};

const catMeta: Record<Category, { label: string; badgeCls: string }> = {
  career: { label: "Career", badgeCls: "career" },
  academic: { label: "Academic", badgeCls: "academic" },
  social: { label: "Social", badgeCls: "social" },
};

function iconForCommand(ico: Command["ico"]) {
  const iconMap: Record<Command["ico"], string> = {
    add: "M12 5v14M5 12h14",
    book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
    net: "M18 5a3 3 0 1 1-.001 0z M6 12a3 3 0 1 1-.001 0z M18 19a3 3 0 1 1-.001 0z M8.59 13.51l6.83 3.98 M15.41 6.51l-6.82 3.98",
    clear: "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6",
    all: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    settings: "M12 12a3 3 0 1 0 0-.001z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  };
  return iconMap[ico];
}

export function PennPrioritiesClient() {
  const [cfg, setCfg] = useState<Settings>(DEFAULT_SETTINGS);
  const [items, setItems] = useState<TaskItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterMode>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<Category>("career");
  const [nextId, setNextId] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdSel, setCmdSel] = useState(0);
  const [toastState, setToastState] = useState<{ msg: string; type: "" | "s" | "i" | "warn"; show: boolean; showUndo: boolean }>({
    msg: "",
    type: "",
    show: false,
    showUndo: false,
  });
  const [undoStack, setUndoStack] = useState<Array<{ snapshot: TaskItem[]; desc: string }>>([]);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const [fName, setFName] = useState("");
  const [fCat, setFCat] = useState<Category>("career");
  const [fStatus, setFStatus] = useState<Status>("notstarted");
  const [fDate, setFDate] = useState(dateToIso(getTodayDate()));
  const [fPriority, setFPriority] = useState<Priority>("medium");
  const [fTime, setFTime] = useState("");
  const [fLabel, setFLabel] = useState("");
  const [fNotes, setFNotes] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      const parsedSettings = savedSettings ? (JSON.parse(savedSettings) as Partial<Settings>) : {};
      setCfg({ ...DEFAULT_SETTINGS, ...parsedSettings });
    } catch {
      setCfg(DEFAULT_SETTINGS);
    }
    try {
      const savedItems = localStorage.getItem(ITEMS_KEY);
      const parsedItems = savedItems ? (JSON.parse(savedItems) as TaskItem[]) : seedItems();
      setItems(parsedItems);
      setNextId(parsedItems.reduce((m, i) => Math.max(m, i.id), 0) + 1);
    } catch {
      const seeded = seedItems();
      setItems(seeded);
      setNextId(seeded.reduce((m, i) => Math.max(m, i.id), 0) + 1);
    }
  }, []);

  function persistSettings(next: Settings) {
    if (typeof window !== "undefined") {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    }
  }
  function persistItems(next: TaskItem[]) {
    if (typeof window !== "undefined") {
      localStorage.setItem(ITEMS_KEY, JSON.stringify(next));
    }
  }

  function toast(msg: string, type: "" | "s" | "i" | "warn" = "", showUndo = false) {
    setToastState({ msg, type, show: true, showUndo });
    window.setTimeout(() => setToastState((p) => ({ ...p, show: false })), 3200);
  }

  function pushUndo(desc: string) {
    setUndoStack((prev) => {
      const next = [...prev, { snapshot: JSON.parse(JSON.stringify(items)) as TaskItem[], desc }];
      return next.length > 20 ? next.slice(next.length - 20) : next;
    });
  }

  function undoLast() {
    setUndoStack((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setItems(last.snapshot);
      persistItems(last.snapshot);
      toast(`Undone: ${last.desc}`, "i", false);
      return prev.slice(0, -1);
    });
  }

  const metrics = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => computeStatus(i) === "done").length;
    const overdue = items.filter((i) => computeStatus(i) === "overdue").length;
    const inprog = items.filter((i) => computeStatus(i) === "inprogress").length;
    const notstart = items.filter((i) => computeStatus(i) === "notstarted").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const barColor = pct >= 80 ? "var(--ok)" : pct >= 50 ? "var(--warn)" : "var(--wharton)";
    return { total, done, overdue, inprog, notstart, pct, barColor };
  }, [items]);

  function categoryRank(cat: Category): number {
    return { career: cfg.rankCareer, academic: cfg.rankAcademic, social: cfg.rankSocial }[cat] ?? 9;
  }
  function priorityRank(p: Priority): number {
    return p === "high" ? 1 : p === "medium" ? 2 : 3;
  }

  function sortItems(list: TaskItem[]): TaskItem[] {
    const mode = cfg.sortMode || "smart";
    return [...list].sort((a, b) => {
      const sa = computeStatus(a);
      const sb = computeStatus(b);
      if (sa === "done" && sb !== "done") return 1;
      if (sb === "done" && sa !== "done") return -1;

      if (mode === "category") {
        const cr = categoryRank(a.cat) - categoryRank(b.cat);
        if (cr !== 0) return cr;
        return a.text.localeCompare(b.text);
      }
      if (mode === "date") {
        if (a.date && b.date) {
          const dr = a.date.localeCompare(b.date);
          if (dr !== 0) return dr;
        } else if (a.date && !b.date) return -1;
        else if (!a.date && b.date) return 1;
        return categoryRank(a.cat) - categoryRank(b.cat);
      }
      if (mode === "priority") {
        const pr = priorityRank(a.priority) - priorityRank(b.priority);
        if (pr !== 0) return pr;
        const cr = categoryRank(a.cat) - categoryRank(b.cat);
        if (cr !== 0) return cr;
        if (a.date && b.date) return a.date.localeCompare(b.date);
        if (a.date && !b.date) return -1;
        if (!a.date && b.date) return 1;
        return 0;
      }

      if (a.date && b.date) {
        const dr = a.date.localeCompare(b.date);
        if (dr !== 0) return dr;
      } else if (a.date && !b.date) return -1;
      else if (!a.date && b.date) return 1;
      const cr = categoryRank(a.cat) - categoryRank(b.cat);
      if (cr !== 0) return cr;
      return (Number(a.timeEst) || 9999) - (Number(b.timeEst) || 9999);
    });
  }

  function filterItems(list: TaskItem[]): TaskItem[] {
    if (activeFilter === "all") return list;
    if (activeFilter === "career" || activeFilter === "academic" || activeFilter === "social") {
      return list.filter((i) => i.cat === activeFilter);
    }
    if (activeFilter === "overdue") return list.filter((i) => computeStatus(i) === "overdue");
    if (activeFilter === "inprogress") return list.filter((i) => computeStatus(i) === "inprogress");
    if (activeFilter === "done") return list.filter((i) => computeStatus(i) === "done");
    return list;
  }

  const renderedItems = useMemo(() => {
    let list = filterItems(items);
    if (!cfg.showDone) list = list.filter((i) => computeStatus(i) !== "done");
    return sortItems(list);
  }, [items, activeFilter, cfg.showDone, cfg.sortMode, cfg.rankCareer, cfg.rankAcademic, cfg.rankSocial]);

  const upcoming = useMemo(() => {
    const today = dateToIso(getTodayDate());
    return items
      .filter((i) => i.status !== "done" && i.date && i.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 7);
  }, [items]);

  const progressByCategory = useMemo(() => {
    const categories: Category[] = ["career", "academic", "social"];
    return categories.map((cat) => {
      const all = items.filter((i) => i.cat === cat);
      const done = all.filter((i) => i.status === "done").length;
      const pct = all.length ? Math.round((done / all.length) * 100) : 0;
      return { cat, done, total: all.length, pct };
    });
  }, [items]);

  function openModal(cat: Category | null) {
    setEditingId(null);
    setFName("");
    setFCat(cat ?? "career");
    setFStatus("notstarted");
    setFDate(dateToIso(getTodayDate()));
    setFPriority("medium");
    setFTime("");
    setFLabel("");
    setFNotes("");
    setModalCategory(cat ?? "career");
    setModalOpen(true);
  }

  function editItemById(id: number) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setEditingId(id);
    setFName(item.text);
    setFCat(item.cat);
    setFStatus(item.status || "notstarted");
    setFDate(item.date || "");
    setFPriority(item.priority || "medium");
    setFTime(item.timeEst || "");
    setFLabel(item.label || "");
    setFNotes(item.notes || "");
    setModalCategory(item.cat);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  function saveItem() {
    const name = fName.trim();
    if (!name) {
      toast("Please enter a task name", "", false);
      return;
    }
    const task: TaskItem = {
      id: editingId ?? nextId,
      cat: fCat,
      text: name,
      status: fStatus,
      date: fDate,
      priority: fPriority,
      timeEst: fTime,
      label: fLabel.trim(),
      notes: fNotes.trim(),
    };
    if (editingId !== null) {
      pushUndo("Edited item");
      const next = items.map((i) => (i.id === editingId ? task : i));
      setItems(next);
      persistItems(next);
      toast("Item updated", "i", true);
    } else {
      const next = [...items, task];
      setItems(next);
      setNextId((p) => p + 1);
      persistItems(next);
      toast("Item added", "i", false);
    }
    closeModal();
  }

  function deleteItem() {
    if (editingId === null) return;
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    pushUndo("Deleted item");
    const next = items.filter((i) => i.id !== editingId);
    setItems(next);
    persistItems(next);
    closeModal();
    toast("Item deleted", "", false);
  }

  function toggleDone(id: number) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const status = computeStatus(item);
    if (status === "done") {
      pushUndo("Moved back to Not Started");
      const next = items.map((i) => (i.id === id ? { ...i, status: "notstarted" as Status } : i));
      setItems(next);
      persistItems(next);
      toast("Moved back to Not Started", "i", true);
    } else if (status === "notstarted" || status === "overdue") {
      pushUndo("Started task");
      const next = items.map((i) => (i.id === id ? { ...i, status: "inprogress" as Status } : i));
      setItems(next);
      persistItems(next);
      toast("Moved to In Progress", "warn", true);
    } else if (status === "inprogress") {
      setConfirmId(id);
    }
  }

  function confirmComplete() {
    if (confirmId === null) return;
    pushUndo("Marked complete");
    const next = items.map((i) => (i.id === confirmId ? { ...i, status: "done" as Status } : i));
    setItems(next);
    persistItems(next);
    setConfirmId(null);
    toast("Marked complete \u2713", "s", true);
  }

  function clearDoneItems() {
    const n = items.filter((i) => i.status === "done").length;
    if (!n) {
      toast("No completed items to clear", "", false);
      return;
    }
    pushUndo(`Cleared ${n} completed item${n > 1 ? "s" : ""}`);
    const next = items.filter((i) => i.status !== "done");
    setItems(next);
    persistItems(next);
    toast(`Cleared ${n} completed item${n > 1 ? "s" : ""}`, "s", true);
  }

  function applySetting<K extends keyof Settings>(k: K, v: Settings[K]) {
    const next = { ...cfg, [k]: v };
    setCfg(next);
    persistSettings(next);
  }

  function resetAll() {
    setCfg(DEFAULT_SETTINGS);
    persistSettings(DEFAULT_SETTINGS);
    toast("Settings reset", "i", false);
  }

  const commands: Command[] = useMemo(
    () => [
      { ico: "add", lbl: "Add Career item", sub: "Recruiting, interviews, applications", fn: () => { openModal("career"); setCmdOpen(false); } },
      { ico: "book", lbl: "Add Academic item", sub: "Assignments, exams, readings", fn: () => { openModal("academic"); setCmdOpen(false); } },
      { ico: "net", lbl: "Add Social item", sub: "Coffee chats, events, networking", fn: () => { openModal("social"); setCmdOpen(false); } },
      { ico: "clear", lbl: "Clear all completed", sub: "Remove done items", fn: () => { clearDoneItems(); setCmdOpen(false); } },
      { ico: "all", lbl: "Show all items", sub: "Remove active filter", fn: () => { setActiveFilter("all"); setCmdOpen(false); } },
      { ico: "settings", lbl: "Open settings", sub: "Sort order, display, rankings", fn: () => { setSettingsOpen(true); setCmdOpen(false); } },
    ],
    [items]
  );

  const filteredCommands = useMemo(() => {
    if (!cmdQuery.trim()) return commands;
    const q = cmdQuery.toLowerCase();
    return commands.filter((c) => c.lbl.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q));
  }, [commands, cmdQuery]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdQuery("");
        setCmdSel(0);
        setCmdOpen(true);
      }
      if (e.key === "Escape") {
        if (modalOpen) setModalOpen(false);
        if (cmdOpen) setCmdOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, cmdOpen]);

  function commandKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCmdSel((s) => Math.min(s + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCmdSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filteredCommands[cmdSel]?.fn();
    } else if (e.key === "Escape") {
      setCmdOpen(false);
    }
  }

  return (
    <>
      <style jsx global>{`
        *{box-sizing:border-box;margin:0;padding:0}
        :root{
          --wharton:#011F5B;--wharton-mid:#1a3a7a;--wharton-lt:#EEF3FB;--bg:#F4F6FA;--surface:#FFFFFF;--surface2:#F0F3F9;--surface3:#E6EAF4;
          --border:#DDE3EF;--border2:#B8C3DC;--t1:#0D1B2E;--t2:#4A5568;--t3:#8A96AA;--t4:#C0C8D6;
          --cat-career:#011F5B;--cat-career-bg:#EEF3FB;--cat-career-t:#011F5B;--cat-academic:#1a5276;--cat-academic-bg:#EAF4FB;--cat-academic-t:#0d3349;
          --cat-social:#2E6DA4;--cat-social-bg:#EBF3FB;--cat-social-t:#1a3f63;--s-overdue-bg:#FEF2F0;--s-overdue-border:#F5C6C2;--s-overdue-text:#922b21;
          --s-overdue-dot:#C0392B;--s-inprog-bg:#FDF8EC;--s-inprog-border:#F0DBA8;--s-inprog-text:#7A4E0A;--s-inprog-dot:#B7770D;--s-notstart-bg:#F4F6FA;
          --s-notstart-border:#DDE3EF;--s-notstart-text:#4A5568;--s-notstart-dot:#8A96AA;--s-done-bg:#F0F4F0;--s-done-border:#C8DBC8;--s-done-text:#4a7a55;
          --s-done-dot:#1a6b55;--danger:#C0392B;--danger-bg:#FEF2F0;--danger-t:#922b21;--warn:#B7770D;--warn-bg:#FDF8EC;--warn-t:#7A4E0A;--ok:#1a6b55;
          --ok-bg:#E8F5F0;--sh-xs:0 1px 2px rgba(1,31,91,.04);--sh-sm:0 1px 4px rgba(1,31,91,.06),0 2px 8px rgba(1,31,91,.03);--sh-md:0 4px 16px rgba(1,31,91,.08),0 2px 6px rgba(1,31,91,.04);
          --sh-lg:0 16px 48px rgba(1,31,91,.12),0 4px 16px rgba(1,31,91,.06);--r:9px;--rl:13px;--rxl:18px;--font:'DM Sans',sans-serif;--mono:'DM Mono',monospace;
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--t1)", fontSize: 13, lineHeight: 1.5, fontFamily: "var(--font)" }}>
        <nav style={{ height: 62, background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 40, boxShadow: "0 1px 0 var(--border),var(--sh-xs)" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", height: "100%", display: "flex", alignItems: "center", padding: "0 24px", gap: 16 }}>
            <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div style={{ width: 32, height: 32, background: "var(--wharton)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>✓</div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                <span style={{ fontSize: 21, fontWeight: 700, color: "var(--wharton)" }}>Penn Priorities</span>
                <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase" }}>Progress Checklist</span>
              </div>
            </a>
            <div style={{ width: 1, height: 20, background: "var(--border)" }} />
            <div style={{ flex: 1, maxWidth: 340, margin: "0 auto" }}>
              <button onClick={() => setCmdOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", width: "100%", borderRadius: 100, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--t3)", fontSize: 12 }}>
                Search or add items...
                <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
                  <span style={{ border: "1px solid var(--border2)", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontFamily: "var(--mono)" }}>⌘</span>
                  <span style={{ border: "1px solid var(--border2)", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontFamily: "var(--mono)" }}>K</span>
                </div>
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setSettingsOpen(true)} style={{ width: 34, height: 34, border: "1px solid var(--border)", borderRadius: 8, background: "none", color: "var(--t2)" }}>⚙</button>
              <div style={{ width: 1, height: 20, background: "var(--border)" }} />
              <button onClick={() => openModal(null)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", background: "var(--wharton)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                + Add item
              </button>
            </div>
          </div>
        </nav>

        <div style={{ padding: "24px 24px 60px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                <MetricCard label="Not Started" value={metrics.notstart} color="var(--s-notstart-text)" />
                <MetricCard label="In Progress" value={metrics.inprog} color={metrics.inprog > 0 ? "var(--s-inprog-text)" : "var(--t3)"} />
                <MetricCard label="Overdue" value={metrics.overdue} color={metrics.overdue > 0 ? "var(--s-overdue-text)" : "var(--t3)"} />
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", boxShadow: "var(--sh-xs)", display: "flex", gap: 12, alignItems: "center", flex: 1.5 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: metrics.barColor }}>{metrics.pct}%</div>
                    <div style={{ fontSize: 10, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em" }}>Complete</div>
                  </div>
                  <div style={{ width: "100%", height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${metrics.pct}%`, height: "100%", background: metrics.barColor }} />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em" }}>Filter</span>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
                  {(["all", "career", "academic", "social", "overdue", "inprogress", "done"] as FilterMode[]).map((f) => (
                    <button key={f} onClick={() => setActiveFilter(f)} style={{ padding: "4px 11px", fontSize: 11, fontWeight: 500, borderRadius: 100, border: "1px solid var(--border)", background: activeFilter === f ? "var(--wharton)" : "var(--surface)", color: activeFilter === f ? "#fff" : "var(--t2)" }}>
                      {f === "all" ? "All" : f === "inprogress" ? "In Progress" : f === "done" ? "Completed" : capitalize(f)}
                    </button>
                  ))}
                </div>
                <button onClick={clearDoneItems} style={{ fontSize: 10, color: "var(--t3)", padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "none" }}>Clear done</button>
              </div>

              {!renderedItems.length ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 20px", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--rl)", boxShadow: "var(--sh-xs)" }}>
                  <div style={{ width: 40, height: 40, background: "var(--wharton-lt)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{activeFilter === "all" ? "No items yet" : "Nothing matches this filter"}</div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>{activeFilter === "all" ? 'Click "Add item" to get started.' : "Try a different filter or add new items."}</div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em" }}>{activeFilter === "all" ? "All items" : "Filtered results"}</span>
                    <span style={{ fontSize: 10, color: "var(--t4)", fontFamily: "var(--mono)" }}>{renderedItems.length} item{renderedItems.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {renderedItems.map((item, index) => {
                      const currentStatus = computeStatus(item);
                      const previousStatus = index > 0 ? computeStatus(renderedItems[index - 1]!) : null;
                      return (
                        <div key={item.id}>
                          {index > 0 && previousStatus !== currentStatus && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 10px" }}>
                              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusMeta[currentStatus].dotColor }} />
                                {statusMeta[currentStatus].label}
                              </div>
                              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                            </div>
                          )}
                          <TaskCard item={item} showNotes={cfg.showNotes} onEdit={() => editItemById(item.id)} onToggle={() => toggleDone(item.id)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 82 }}>
              <Panel title="Upcoming Deadlines" badge={upcoming.length}>
                {!upcoming.length ? (
                  <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "var(--t3)" }}>No upcoming deadlines</div>
                ) : upcoming.map((i) => {
                  const d = daysApart(i.date);
                  const lbl = d <= 0 ? "Today" : d === 1 ? "Tomorrow" : formatDisplayDate(i.date);
                  return (
                    <div key={i.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 4, background: `var(--cat-${i.cat})` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.text}</div>
                        <div style={{ fontSize: 10, color: "var(--t3)", fontFamily: "var(--mono)" }}>{catMeta[i.cat].label}</div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: d <= 0 ? "var(--danger)" : d <= 1 ? "var(--warn)" : "var(--surface2)", color: d <= 1 ? "#fff" : "var(--t3)" }}>{lbl}</span>
                    </div>
                  );
                })}
              </Panel>
              <Panel title="Progress">
                {progressByCategory.map((r) => (
                  <div key={r.cat} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: `var(--cat-${r.cat})` }} />
                    <div style={{ fontSize: 11.5, flex: 1 }}>{capitalize(r.cat)}</div>
                    <div style={{ width: 70, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${r.pct}%`, height: "100%", background: `var(--cat-${r.cat})` }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--t3)", minWidth: 28, textAlign: "right", fontFamily: "var(--mono)" }}>{r.done}/{r.total}</div>
                  </div>
                ))}
              </Panel>
            </div>
          </div>
        </div>

        {cmdOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(24,23,26,.28)", zIndex: 900, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }} onClick={(e) => e.currentTarget === e.target && setCmdOpen(false)}>
            <div style={{ width: 500, maxWidth: "92vw", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--rxl)", overflow: "hidden", boxShadow: "var(--sh-lg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "13px 15px", borderBottom: "1px solid var(--border)" }}>
                <input value={cmdQuery} onChange={(e) => { setCmdQuery(e.target.value); setCmdSel(0); }} onKeyDown={commandKeyDown} placeholder="Add item, filter, clear done..." style={{ flex: 1, border: "none", outline: "none", fontSize: 13 }} autoFocus />
                <span style={{ border: "1px solid var(--border2)", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontFamily: "var(--mono)" }}>Esc</span>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                <div style={{ padding: "7px 15px 3px", fontSize: 9, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em" }}>Commands</div>
                {filteredCommands.length ? filteredCommands.map((c, i) => (
                  <div key={c.lbl} onClick={() => c.fn()} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 15px", background: i === cmdSel ? "var(--surface2)" : "transparent", cursor: "pointer" }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                        {iconForCommand(c.ico).split(" M").map((part, idx) => <path key={idx} d={idx === 0 ? part : `M${part}`} />)}
                      </svg>
                    </div>
                    <div><div style={{ fontSize: 12 }}>{c.lbl}</div><div style={{ fontSize: 10, color: "var(--t3)" }}>{c.sub}</div></div>
                  </div>
                )) : <div style={{ padding: 14, fontSize: 12, color: "var(--t3)", textAlign: "center" }}>No matching commands</div>}
              </div>
            </div>
          </div>
        )}

        {settingsOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, background: "rgba(24,23,26,.18)", zIndex: 800 }} onClick={() => setSettingsOpen(false)} />
            <div style={{ position: "fixed", top: 0, right: 0, height: "100%", width: 360, background: "var(--surface)", borderLeft: "1px solid var(--border)", zIndex: 801, overflowY: "auto", boxShadow: "-6px 0 28px rgba(24,23,26,.1)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid var(--border)" }}>
                <div><div style={{ fontSize: 14, fontWeight: 500 }}>Settings</div><div style={{ fontSize: 11, color: "var(--t3)" }}>Customize Penn Priorities</div></div>
                <button onClick={() => setSettingsOpen(false)} style={{ width: 28, height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "none" }}>×</button>
              </div>
              <div style={{ padding: "14px 20px 40px" }}>
                <SettingToggle label="Show completed items" sub="Keep done tasks visible (faded)" checked={cfg.showDone} onChange={(v) => applySetting("showDone", v)} />
                <SettingToggle label="Show item notes" checked={cfg.showNotes} onChange={(v) => applySetting("showNotes", v)} />
                <div style={{ marginTop: 14, fontSize: 12 }}>Sort mode</div>
                <select value={cfg.sortMode} onChange={(e) => applySetting("sortMode", e.target.value as SortMode)} style={{ width: "100%", marginTop: 6, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7 }}>
                  <option value="smart">Smart (type + date + time)</option>
                  <option value="date">Due date first</option>
                  <option value="priority">Priority first</option>
                  <option value="category">Category only</option>
                </select>
                <div style={{ marginTop: 14, fontSize: 12 }}>Category ranking</div>
                {(["Career", "Academic", "Social"] as const).map((c) => {
                  const key = `rank${c}` as keyof Settings;
                  const val = cfg[key] as number;
                  return (
                    <div key={c} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <div>{c}</div>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[1, 2, 3].map((n) => (
                          <button key={n} onClick={() => applySetting(key, n as never)} style={{ padding: "3px 8px", border: "1px solid var(--border)", borderRadius: 20, background: val === n ? "var(--wharton)" : "none", color: val === n ? "#fff" : "var(--t2)" }}>{n}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <button onClick={resetAll} style={{ width: "100%", marginTop: 10, padding: 8, border: "1px solid var(--border)", borderRadius: 7, background: "none" }}>Reset all settings to defaults</button>
              </div>
            </div>
          </>
        )}

        {modalOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(24,23,26,.4)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--rxl)", width: 440, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--sh-lg)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{editingId !== null ? "Edit item" : "Add item"}</div>
                <button onClick={closeModal} style={{ width: 26, height: 26, border: "1px solid var(--border)", borderRadius: 6 }}>×</button>
              </div>
              <div style={{ padding: "18px 20px" }}>
                <Field label="Task name"><input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Follow up with Jane at Blackstone" /></Field>
                <Row>
                  <Field label="Category"><select value={fCat} onChange={(e) => setFCat(e.target.value as Category)}><option value="career">Career / Recruiting</option><option value="academic">Academic</option><option value="social">Social / Networking</option></select></Field>
                  <Field label="Status"><select value={fStatus} onChange={(e) => setFStatus(e.target.value as Status)}><option value="notstarted">Not Started</option><option value="inprogress">In Progress</option><option value="done">Done</option></select></Field>
                </Row>
                <Row>
                  <Field label="Due date"><input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} /></Field>
                  <Field label="Priority"><select value={fPriority} onChange={(e) => setFPriority(e.target.value as Priority)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
                </Row>
                <Row>
                  <Field label="Est. time to complete"><select value={fTime} onChange={(e) => setFTime(e.target.value)}><option value="">-</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">1 hr</option><option value="90">1.5 hr</option><option value="120">2 hr</option><option value="180">3 hr</option><option value="240">4 hr</option><option value="480">Half day</option><option value="960">Full day</option></select></Field>
                  <Field label="Label / Tag"><input value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder="e.g. GS, FNCE 611" /></Field>
                </Row>
                <Field label="Notes"><textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Context, links, or reminders..." /></Field>
              </div>
              <div style={{ display: "flex", gap: 7, justifyContent: "flex-end", padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
                {editingId !== null && <button onClick={deleteItem} style={{ marginRight: "auto", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 14px", color: "var(--danger)", background: "none" }}>Delete</button>}
                <button onClick={closeModal} style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "7px 14px", background: "none" }}>Cancel</button>
                <button onClick={saveItem} style={{ background: "var(--wharton)", color: "#fff", border: "none", borderRadius: 7, padding: "7px 18px" }}>Save item</button>
              </div>
            </div>
          </div>
        )}

        {toastState.show && (
          <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toastState.type === "s" ? "var(--ok)" : toastState.type === "i" ? "var(--wharton)" : toastState.type === "warn" ? "var(--warn)" : "var(--t1)", color: "#fff", fontSize: 11.5, fontWeight: 500, padding: "9px 10px 9px 16px", borderRadius: 24, boxShadow: "var(--sh-lg)", zIndex: 9999, display: "flex", alignItems: "center", gap: 10 }}>
            <span>{toastState.msg}</span>
            {toastState.showUndo && undoStack.length > 0 && <button onClick={undoLast} style={{ background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 14, padding: "4px 11px", fontSize: 10.5 }}>Undo</button>}
          </div>
        )}

        {confirmId !== null && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(24,23,26,.35)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--rxl)", width: 360, maxWidth: "92vw", boxShadow: "var(--sh-lg)", padding: "24px 24px 20px", textAlign: "center" }}>
              <div style={{ width: 44, height: 44, background: "var(--ok-bg)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Mark as complete?</div>
              <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 20 }}>"{items.find((i) => i.id === confirmId)?.text}" will be moved to done. You can undo this.</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => setConfirmId(null)} style={{ padding: "8px 20px", border: "1px solid var(--border)", borderRadius: 8, background: "none" }}>Not yet</button>
                <button onClick={confirmComplete} style={{ padding: "8px 22px", border: "none", borderRadius: 8, background: "var(--ok)", color: "#fff" }}>Mark complete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", boxShadow: "var(--sh-xs)", display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
    </div>
  );
}

function Panel({ title, badge, children }: { title: string; badge?: number; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--rl)", overflow: "hidden", boxShadow: "var(--sh-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 10px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>{title} {typeof badge === "number" && <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 20, background: "var(--t1)", color: "#fff" }}>{badge}</span>}</div>
      </div>
      <div style={{ padding: "10px 14px" }}>{children}</div>
    </div>
  );
}

function TaskCard({ item, showNotes, onEdit, onToggle }: { item: TaskItem; showNotes: boolean; onEdit: () => void; onToggle: () => void }) {
  const status = computeStatus(item);
  const sm = statusMeta[status];
  const cm = catMeta[item.cat];
  const days = item.date ? daysApart(item.date) : null;
  let dueStr = "";
  if (item.date) {
    if ((days ?? 0) < 0) dueStr = `${Math.abs(days ?? 0)}d overdue`;
    else if (days === 0) dueStr = "Due today";
    else if (days === 1) dueStr = "Due tomorrow";
    else dueStr = `Due ${formatDisplayDate(item.date)}`;
  }
  const te = formatTime(item.timeEst);
  return (
    <div onClick={onEdit} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--rl)", padding: "12px 14px 12px 12px", display: "flex", alignItems: "flex-start", gap: 10, boxShadow: "var(--sh-xs)", opacity: status === "done" ? 0.55 : 1, cursor: "pointer" }}>
      <input type="checkbox" checked={status === "done"} onChange={onToggle} onClick={(e) => e.stopPropagation()} style={{ width: 16, height: 16, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 500, flex: 1, textDecoration: status === "done" ? "line-through" : "none", color: status === "done" ? "var(--t3)" : "var(--t1)" }}>{item.text}</div>
          <div style={{ fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, color: `var(--s-${sm.cls === "notstarted" ? "notstart" : sm.cls}-text)` }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: sm.dotColor }} />
            {sm.label}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: `var(--cat-${cm.badgeCls}-bg)`, color: `var(--cat-${cm.badgeCls}-t)` }}>{item.label || cm.label}</span>
          {dueStr && <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: "var(--mono)" }}>{dueStr}</span>}
          {te && <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: "var(--mono)" }}>{te}</span>}
          <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 6px", borderRadius: 20, border: "1px solid var(--border)", background: item.priority === "high" ? "#FEF2F0" : item.priority === "medium" ? "var(--warn-bg)" : "var(--surface2)", color: item.priority === "high" ? "var(--danger-t)" : item.priority === "medium" ? "var(--warn-t)" : "var(--t3)" }}>
            {capitalize(item.priority)}
          </span>
        </div>
        {showNotes && item.notes && <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 5, fontStyle: "italic" }}>{item.notes}</div>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ background: "none", border: "none", color: "var(--t4)", padding: 3 }}>✎</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", fontSize: 9, fontWeight: 500, color: "var(--t2)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</label>
      <div style={{ width: "100%" }}>{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 13 }}>{children}</div>;
}

function SettingToggle({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <div><div style={{ fontSize: 12 }}>{label}</div>{sub && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{sub}</div>}</div>
      <label style={{ position: "relative", display: "inline-flex", cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
        <span style={{ width: 32, height: 17, background: checked ? "var(--wharton)" : "var(--border2)", borderRadius: 20, display: "inline-flex", alignItems: "center", padding: 1.5 }}>
          <span style={{ width: 14, height: 14, background: "#fff", borderRadius: "50%", transform: checked ? "translateX(15px)" : "translateX(0)" }} />
        </span>
      </label>
    </div>
  );
}
