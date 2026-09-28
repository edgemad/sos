// Snapshot-based undo/redo for the Sheets editor.
// Every mutating command funnels through commitSheets() (a wrapper around
// state.updateContent), which captures the pre-mutation state — correct for
// structural ops (insert/delete row/col, sort, fill, tab add/remove, charts)
// that execCommand("undo") cannot reverse. The undo stack stores deep copies;
// dedupe compares against the TOP of the stack so consecutive no-ops collapse
// while genuine changes always push.

import { get } from "svelte/store";
import { openFile, updateContent } from "./state";
import type { SheetData } from "../types";

const MAX_HISTORY = 50;

interface StackEntry {
  fileId: string;
  data: SheetData; // deep-copied snapshot
  snap: string; // pre-serialized form for fast dedupe
}

const undoStack: StackEntry[] = [];
const redoStack: StackEntry[] = [];

let enabled = false;

function currentData(): { fileId: string; data: SheetData; snap: string } | null {
  const f = get(openFile);
  if (!f || f.kind !== "spreadsheet") return null;
  const d = f.content as SheetData;
  if (!d || !Array.isArray(d.sheets)) return null;
  return { fileId: f.id, data: d, snap: JSON.stringify({ s: d.sheets, a: d.activeSheet }) };
}

function deepCopy(d: SheetData): SheetData {
  return JSON.parse(JSON.stringify({ sheets: d.sheets, activeSheet: d.activeSheet })) as SheetData;
}

function pushUndo(entry: StackEntry): void {
  undoStack.push(entry);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
}

/** Capture the pre-mutation state (deduped against the stack top). */
function capture(cur: { fileId: string; data: SheetData; snap: string } | null): void {
  if (!enabled || !cur) return;
  const top = undoStack[undoStack.length - 1];
  if (top && top.snap === cur.snap) return; // identical state already saved
  pushUndo({ fileId: cur.fileId, data: deepCopy(cur.data), snap: cur.snap });
  redoStack.length = 0;
}

/**
 * Wrapper around state.updateContent used by every Sheets mutation so the
 * pre-mutation state lands on the undo stack exactly once per real change.
 */
export function commitSheets(fileId: string, data: SheetData): void {
  const cur = currentData();
  if (enabled && cur && cur.fileId === fileId) capture(cur);
  updateContent(fileId, data);
}

/** Switching files must not undo across documents. */
export function resetSheetsHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
}

export function sheetsUndo(): boolean {
  const entry = undoStack.pop();
  if (!entry) return false;
  const f = get(openFile);
  if (!f || f.id !== entry.fileId) {
    undoStack.push(entry); // foreign file — put it back
    return false;
  }
  const cur = currentData();
  if (cur) redoStack.push({ fileId: cur.fileId, data: deepCopy(cur.data), snap: cur.snap });
  updateContent(entry.fileId, entry.data);
  return true;
}

export function sheetsRedo(): boolean {
  const entry = redoStack.pop();
  if (!entry) return false;
  const f = get(openFile);
  if (!f || f.id !== entry.fileId) {
    redoStack.push(entry);
    return false;
  }
  const cur = currentData();
  if (cur) pushUndo({ fileId: cur.fileId, data: deepCopy(cur.data), snap: cur.snap });
  updateContent(entry.fileId, entry.data);
  return true;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

/** Called on Sheets mount / unmount to scope the wrapper to this editor. */
export function setSheetsHistoryEnabled(on: boolean): void {
  enabled = on;
}
