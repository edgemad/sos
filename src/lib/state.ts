// Central application state: the suite's local "Drive".
// Single source of truth for files, notes and events; persisted to
// localStorage (browser) and optionally mirrored to disk via Tauri auto-save.

import { writable, derived, get } from "svelte/store";
import type {
  SosState,
  SosFile,
  SosFileMeta,
  DocKind,
  ModuleId,
  Note,
  CalendarEvent,
  WriterDoc,
  WriterTab,
  SheetData,
  Deck,
  FormDoc,
  FormResponse
} from "../types";
import { uid, now } from "./utils";

const STORAGE_KEY = "sos.state.v1";

const emptyState = (): SosState => ({
  version: 1,
  files: {},
  notes: [],
  events: [],
  recent: []
});

function loadState(): SosState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as SosState;
    const merged = { ...emptyState(), ...parsed };
    // Corrupt-state recovery: files must be a record of well-formed entries.
    // Damaged entries are dropped instead of crashing every module on open.
    const healthy: Record<string, SosFile<unknown>> = {};
    const rawFiles = parsed.files;
    if (rawFiles && typeof rawFiles === "object" && !Array.isArray(rawFiles)) {
      for (const [id, f] of Object.entries(rawFiles)) {
        if (f && typeof (f as SosFile<unknown>).id === "string" && typeof (f as SosFile<unknown>).kind === "string" && (f as SosFile<unknown>).content != null) {
          healthy[id] = f as SosFile<unknown>;
        }
      }
    } else if (Array.isArray(rawFiles)) {
      for (const f of rawFiles as SosFile<unknown>[]) {
        if (f && typeof f.id === "string" && typeof f.kind === "string" && f.content != null) healthy[f.id] = f;
      }
    }
    if (Object.keys(healthy).length !== Object.keys(rawFiles ?? {}).length) {
      console.warn("SOS: dropped corrupt file entries while loading.");
    }
    merged.files = healthy;
    if (!Array.isArray(merged.notes)) merged.notes = [];
    if (!Array.isArray(merged.events)) merged.events = [];
    if (!Array.isArray(merged.recent)) merged.recent = [];
    return merged;
  } catch {
    // file:// origins and privacy modes can deny storage access
    return emptyState();
  }
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* non-fatal */
  }
}

export const state = writable<SosState>(loadState());

// ── Persistence ─────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;

state.subscribe((s) => {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 600);
  void s;
});

export async function persist(): Promise<void> {
  if (!dirty) return;
  dirty = false;
  safeSetItem(STORAGE_KEY, JSON.stringify(get(state)));
}

// ── UI stores ───────────────────────────────────────────────────

export const activeModule = writable<ModuleId>("home");
export const activeFileId = writable<string | null>(null);
export const sidebarOpen = writable(true);
export const paletteOpen = writable(false);
export const darkMode = writable<boolean>(safeGetItem("sos.dark") === "1");
darkMode.subscribe((v) => {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", v);
  }
  safeSetItem("sos.dark", v ? "1" : "0");
});

export const saveStatus = writable<"idle" | "saving" | "saved">("saved");

// ── Derived views (the Drive) ───────────────────────────────────

export const fileMetas = derived(state, (s) =>
  Object.values(s.files).map((f) => metaOf(f))
);

export function metaOf(f: SosFile<unknown>): SosFileMeta {
  const { content: _c, ...meta } = f;
  return meta;
}

export const openFile = derived([state, activeFileId], ([$s, $id]) =>
  $id && $s.files[$id] ? $s.files[$id] : null
);

// ── File operations ─────────────────────────────────────────────

const defaultContent = (kind: DocKind): unknown => {
  switch (kind) {
    case "document": {
      const tabId = uid();
      return {
        html: "<h1>Untitled document</h1><p>Start writing…</p>",
        words: 3,
        tabs: [{ id: tabId, name: "Tab 1", html: "<h1>Untitled document</h1><p>Start writing…</p>" }],
        activeTabId: tabId,
        settings: {
          orientation: "portrait",
          pageless: false,
          columns: 1,
          zoom: 100,
          header: "",
          footer: "",
          showHeader: false,
          showFooter: false,
          pageNumbers: "none",
          textDirection: "ltr"
        }
      } as WriterDoc;
    }
    case "spreadsheet":
      return {
        sheets: [{ name: "Sheet1", rows: 60, cols: 18, cells: {} }],
        activeSheet: 0
      } as SheetData;
    case "deck": {
      const slide = {
        id: uid(),
        background: "#ffffff",
        notes: "",
        blocks: [
          {
            id: uid(),
            type: "title" as const,
            x: 10, y: 30, w: 80, h: 20,
            text: "Untitled presentation",
            color: "#202124",
            fontSize: 44,
            align: "left" as const
          }
        ]
      };
      return { slides: [slide] } as Deck;
    }
    case "form":
      return {
        title: "Untitled form",
        description: "",
        questions: [],
        responses: [] as FormResponse[]
      } as FormDoc & { responses: FormResponse[] };
    case "note":
      return { text: "" };
  }
};

export function moduleForKind(kind: DocKind): ModuleId {
  switch (kind) {
    case "document": return "writer";
    case "spreadsheet": return "sheets";
    case "deck": return "slides";
    case "form": return "forms";
    case "note": return "keep";
  }
}

export function createFile(kind: DocKind, name?: string): string {
  const id = uid();
  const t = now();
  const file: SosFile<unknown> = {
    id,
    kind,
    name: name ?? defaultName(kind),
    createdAt: t,
    updatedAt: t,
    starred: false,
    trashed: false,
    content: defaultContent(kind)
  };
  state.update((s) => ({
    ...s,
    files: { ...s.files, [id]: file },
    recent: [id, ...s.recent.filter((r) => r !== id)].slice(0, 24)
  }));
  openInEditor(id);
  return id;
}

function defaultName(kind: DocKind): string {
  const d = new Date();
  const stamp = `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  switch (kind) {
    case "document": return `Untitled document · ${stamp}`;
    case "spreadsheet": return `Untitled spreadsheet · ${stamp}`;
    case "deck": return `Untitled presentation · ${stamp}`;
    case "form": return `Untitled form · ${stamp}`;
    case "note": return "New note";
  }
}

export function openInEditor(id: string): void {
  const f = get(state).files[id];
  if (!f) return;
  activeFileId.set(id);
  activeModule.set(moduleForKind(f.kind));
  state.update((s) => ({
    ...s,
    recent: [id, ...s.recent.filter((r) => r !== id)].slice(0, 24)
  }));
  saveStatus.set("saved");
}

export function renameFile(id: string, name: string): void {
  touch(id, { name });
}

export function touch(id: string, patch: Partial<SosFileMeta> = {}): void {
  state.update((s) => {
    const f = s.files[id];
    if (!f) return s;
    return { ...s, files: { ...s.files, [id]: { ...f, ...patch, updatedAt: now() } } };
  });
}

/** Update a file's content (auto-saves via the state subscription). */
export function updateContent<T>(id: string, content: T): void {
  saveStatus.set("saving");
  state.update((s) => {
    const f = s.files[id];
    if (!f) return s;
    return { ...s, files: { ...s.files, [id]: { ...f, content, updatedAt: now() } } };
  });
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => saveStatus.set("saved"), 500);
}

let saveStatusTimer: ReturnType<typeof setTimeout>;

export function toggleStar(id: string): void {
  const f = get(state).files[id];
  if (f) touch(id, { starred: !f.starred });
}

export function trashFile(id: string): void {
  touch(id, { trashed: true });
  if (get(activeFileId) === id) {
    activeFileId.set(null);
    activeModule.set("home");
  }
}

export function restoreFile(id: string): void {
  touch(id, { trashed: false });
}

export function deleteForever(id: string): void {
  state.update((s) => {
    const files = { ...s.files };
    delete files[id];
    return { ...s, files, recent: s.recent.filter((r) => r !== id) };
  });
}

export function emptyTrash(): void {
  state.update((s) => {
    const files: typeof s.files = {};
    for (const [id, f] of Object.entries(s.files)) if (!f.trashed) files[id] = f;
    return { ...s, files };
  });
}

export function setColor(id: string, color: string): void {
  touch(id, { color });
}

// ── Docs: multi-tab document management ─────────────────────────

/** List of tabs for a Writer doc (synthesizes a single tab for legacy docs). */
export function writerTabs(doc: WriterDoc): WriterTab[] {
  if (doc.tabs && doc.tabs.length) return doc.tabs;
  return [{ id: doc.activeTabId ?? "legacy", name: "Tab 1", html: doc.html }];
}

export function addWriterTab(fileId: string): void {
  const file = get(state).files[fileId];
  if (!file || file.kind !== "document") return;
  const doc = file.content as WriterDoc;
  const tabs = writerTabs(doc);
  const t: WriterTab = { id: uid(), name: `Tab ${tabs.length + 1}`, html: "<p></p>" };
  updateContent(fileId, { ...doc, tabs: [...tabs, t], activeTabId: t.id, html: t.html, words: 0 } as WriterDoc);
}

export function selectWriterTab(fileId: string, tabId: string): void {
  const file = get(state).files[fileId];
  if (!file || file.kind !== "document") return;
  const doc = file.content as WriterDoc;
  const tabs = writerTabs(doc);
  const t = tabs.find((x) => x.id === tabId);
  if (!t) return;
  updateContent(fileId, { ...doc, activeTabId: tabId, html: t.html, words: countWordsHtml(t.html) } as WriterDoc);
}

export function renameWriterTab(fileId: string, tabId: string, name: string): void {
  const file = get(state).files[fileId];
  if (!file || file.kind !== "document") return;
  const doc = file.content as WriterDoc;
  const tabs = writerTabs(doc).map((t) => (t.id === tabId ? { ...t, name } : t));
  updateContent(fileId, { ...doc, tabs } as WriterDoc);
}

export function deleteWriterTab(fileId: string, tabId: string): void {
  const file = get(state).files[fileId];
  if (!file || file.kind !== "document") return;
  const doc = file.content as WriterDoc;
  const tabs = writerTabs(doc);
  if (tabs.length <= 1) return;
  const next = tabs.filter((t) => t.id !== tabId);
  const activeTabId = doc.activeTabId === tabId ? next[0].id : doc.activeTabId;
  const active = next.find((t) => t.id === activeTabId)!;
  updateContent(fileId, { ...doc, tabs: next, activeTabId, html: active.html, words: countWordsHtml(active.html) } as WriterDoc);
}

function countWordsHtml(html: string): number {
  const t = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return t ? t.split(" ").length : 0;
}

/** Duplicate any file (used by Docs File → Make a copy). */
export function duplicateFile(id: string): void {
  const s = get(state);
  const f = s.files[id];
  if (!f) return;
  const newId = uid();
  const t = now();
  const copy: SosFile<unknown> = {
    ...f,
    id: newId,
    name: `Copy of ${f.name}`,
    createdAt: t,
    updatedAt: t,
    starred: false,
    trashed: false,
    content: JSON.parse(JSON.stringify(f.content))
  };
  state.update((st) => ({
    ...st,
    files: { ...st.files, [newId]: copy },
    recent: [newId, ...st.recent].slice(0, 24)
  }));
  openInEditor(newId);
}

// ── Notes (Keep) ────────────────────────────────────────────────

export function addNote(color = "#fff475"): string {
  const n: Note = { id: uid(), text: "", color, pinned: false, updatedAt: now(), checklist: [] };
  state.update((s) => ({ ...s, notes: [n, ...s.notes] }));
  return n.id;
}

export function updateNote(id: string, patch: Partial<Note>): void {
  state.update((s) => ({
    ...s,
    notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: now() } : n))
  }));
}

export function deleteNote(id: string): void {
  state.update((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));
}

// ── Calendar events ─────────────────────────────────────────────

export function addEvent(e: Omit<CalendarEvent, "id">): void {
  state.update((s) => ({ ...s, events: [...s.events, { ...e, id: uid() }] }));
}

export function updateEvent(id: string, patch: Partial<CalendarEvent>): void {
  state.update((s) => ({
    ...s,
    events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e))
  }));
}

export function deleteEvent(id: string): void {
  state.update((s) => ({ ...s, events: s.events.filter((e) => e.id !== id) }));
}

// ── Factory defaults for new docs opened from Home ──────────────

export function blankForm(): FormDoc {
  return { title: "Untitled form", description: "", questions: [] };
}
