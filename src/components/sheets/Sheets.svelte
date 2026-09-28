<script lang="ts">
  import { onDestroy } from "svelte";
  // Sheets: Google Sheets-style menubar + toolbar + smart formula bar +
  // virtualized grid with freeze panes, filters, number formats, checkboxes,
  // dropdowns, notes, insert/delete rows & columns, cleanup tools and stats.
  import { openFile, updateContent } from "../../lib/state";
  import { evaluateCell, displayValue, cellKey, colToName, ERROR } from "../../lib/formula";
  import type { CellValue } from "../../lib/formula";
  import type { SheetData, SheetTab, CellMeta, SheetChart } from "../../types";
  import { suggestFunctions } from "../../lib/formulaCatalog";
  import { toCsv, parseCsv as csvParse, download, escapeHtml } from "../../lib/utils";
  import { saveFileDialog } from "../../lib/tauri";
  import { exportXlsx, exportOds, exportJson, importXlsx, importOds, type SheetGrid } from "../../lib/converters";
  import SheetsMenubar from "./SheetsMenubar.svelte";
  import SheetsToolbar from "./SheetsToolbar.svelte";
  import TransferModal from "../layout/TransferModal.svelte";
  import SheetChartView from "./SheetChart.svelte";
  import ChartModal from "./ChartModal.svelte";
  import { commitSheets, sheetsUndo, sheetsRedo, resetSheetsHistory, setSheetsHistoryEnabled } from "../../lib/sheetHistory";
  import { uid } from "../../lib/utils";
  import { isMod } from "../../lib/shortcuts";

  onDestroy(() => {
    setSheetsHistoryEnabled(false);
    window.removeEventListener("mousemove", onChartDrag);
  });
  // Scope the history engine to the open spreadsheet; reset only when the
  // FILE changes (not on every content update, which would erase undo history).
  let scopedFileId: string | null = null;
  $: if (file && file.kind === "spreadsheet" && data) {
    setSheetsHistoryEnabled(true);
    if (scopedFileId !== file.id) {
      scopedFileId = file.id;
      resetSheetsHistory();
    }
  } else {
    setSheetsHistoryEnabled(false);
  }

  $: file = $openFile;
  $: data = file && file.kind === "spreadsheet" ? (file.content as SheetData) : null;
  $: tab = data ? data.sheets[data.activeSheet] : null;

  const ROW_H = 24;
  const COL_W = 100;
  const HEAD_H = 24;

  let selRow = 0;
  let selCol = 0;
  let editing = false;
  let editValue = "";
  let editingInGrid = false;

  let formulaMode: boolean = false;
  let pickedBox: { r0: number; r1: number; c0: number; c1: number } | null = null;
  let liveRef = "A1";
  let rangeAnchor: { row: number; col: number } | null = null;
  let rangeCursor: { row: number; col: number } | null = null;

  let headerCols: number[] = [];
  $: headerCols = tab ? range(0, tab.cols) : [];

  // Reactive mirrors for template use (Svelte 4 can't track function calls)
  $: formulaMode = editing && editValue.startsWith("=");
  $: pickedBox = formulaMode && rangeCursor
    ? rangeAnchor
      ? {
          r0: Math.min(rangeAnchor.row, rangeCursor.row),
          r1: Math.max(rangeAnchor.row, rangeCursor.row),
          c0: Math.min(rangeAnchor.col, rangeCursor.col),
          c1: Math.max(rangeAnchor.col, rangeCursor.col)
        }
      : { r0: rangeCursor.row, r1: rangeCursor.row, c0: rangeCursor.col, c1: rangeCursor.col }
    : null;
  $: liveRef = pickedBox
    ? `${cellKey(pickedBox.r0, pickedBox.c0)}:${cellKey(pickedBox.r1, pickedBox.c1)}`
    : cellKey(rangeCursor ? rangeCursor.row : selRow, rangeCursor ? rangeCursor.col : selCol);

  let editAnchorRow = 0;
  let editAnchorCol = 0;
  let gridFormulaInput: HTMLInputElement | undefined;
  let cellEditInput: HTMLInputElement | undefined;

  let scrollTop = 0;
  let viewportH = 600;
  let container: HTMLDivElement;
  let formulaInput: HTMLInputElement;
  let gridZoom = 100;

  // Selected rectangular range (drag or shift-click) — used by charts.
  let selRange: { r0: number; r1: number; c0: number; c1: number } | null = null;
  let rangeStart: { row: number; col: number } | null = null;

  // Chart card drag state
  let draggingChart: string | null = null;
  let dragOffX = 0;
  let dragOffY = 0;
  let chartDraft = "";

  // Suggestions
  let suggestions: ReturnType<typeof suggestFunctions> = [];
  let suggestionIndex = 0;
  let showSuggestions = false;

  // Dialogs
  let dialog: null | "find" | "dropdown" | "note" | "stats" | "validate" | "emoji" | "named" | "shortcuts" | "fnlist" | "details" | "protect" | "chart" = null;

  // ── Import / Export (consistent with Docs & Slides) ────────────
  let transfer: null | "import" | "export" = null;
  const SHEET_EXPORT_OPTS = [
    { id: "xlsx", label: "Microsoft Excel (.xlsx)", ext: "XLSX", desc: "All sheets, opens in Excel/LibreOffice" },
    { id: "ods", label: "OpenDocument (.ods)", ext: "ODS", desc: "OpenDocument spreadsheet" },
    { id: "csv", label: "CSV (.csv)", ext: "CSV", desc: "Current sheet, comma-separated" },
    { id: "tsv", label: "TSV (.tsv)", ext: "TSV", desc: "Current sheet, tab-separated" },
    { id: "json", label: "JSON (.json)", ext: "JSON", desc: "Full workbook data" }
  ];
  const SHEET_IMPORT_OPTS = [
    { id: "xlsx", label: "Microsoft Excel (.xlsx)", ext: "XLSX", desc: "All worksheets become tabs" },
    { id: "ods", label: "OpenDocument (.ods)", ext: "ODS", desc: "OpenDocument spreadsheet" },
    { id: "csv", label: "CSV (.csv)", ext: "CSV", desc: "Comma-separated values" },
    { id: "tsv", label: "TSV (.tsv)", ext: "TSV", desc: "Tab-separated values" },
    { id: "json", label: "JSON (.json)", ext: "JSON", desc: "SOS workbook export" }
  ];

  function browserPickFile(filter: string): Promise<File | null> {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = filter;
      inp.onchange = () => resolve(inp.files?.[0] ?? null);
      inp.oncancel = () => resolve(null);
      inp.click();
    });
  }

  function gridOf(t: SheetTab): string[][] {
    const grid: string[][] = [];
    for (let r = 0; r < t.rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < t.cols; c++) {
        const key = cellKey(r, c);
        row.push(display[key] ?? t.cells[key] ?? "");
      }
      grid.push(row);
    }
    return grid;
  }

  async function doSheetImport(format: string): Promise<void> {
    transfer = null;
    if (!file || !data) return;
    try {
      const f = await browserPickFile(".csv,.tsv,.xlsx,.ods,.json");
      if (!f) return;
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      let grids: SheetGrid[] = [];
      if (ext === "xlsx" || format === "xlsx") grids = await importXlsx(new Uint8Array(await f.arrayBuffer()));
      else if (ext === "ods") grids = await importOds(new Uint8Array(await f.arrayBuffer()));
      else if (ext === "tsv") grids = [{ name: f.name.replace(/\.[^.]+$/, ""), rows: csvParse(await f.text(), "\t") }];
      else if (ext === "json") {
        const parsed = JSON.parse(await f.text()) as { sheets?: { name?: string; rows?: number; cols?: number; cells?: Record<string, string> }[] };
        if (Array.isArray(parsed.sheets)) {
          grids = parsed.sheets.map((s) => {
            const rows = s.rows ?? 60;
            const cols = s.cols ?? 18;
            const g: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
            for (const [k, v] of Object.entries(s.cells ?? {})) {
              const m = /^([A-Z]+)(\d+)$/.exec(k);
              if (!m) continue;
              const r = Number(m[2]) - 1;
              let ci = 0;
              for (const ch of m[1]) ci = ci * 26 + (ch.charCodeAt(0) - 64);
              ci -= 1;
              if (r < rows && ci < cols) g[r][ci] = v;
            }
            return { name: s.name ?? "Sheet1", rows: g };
          });
        } else throw new Error("Unrecognized JSON structure.");
      }
      else grids = [{ name: f.name.replace(/\.[^.]+$/, ""), rows: csvParse(await f.text()) }];

      if (!grids.length) throw new Error("No data found in the file.");
      const sheets = grids.map((g) => {
        const cols = Math.max(18, ...g.rows.map((r) => r.length));
        const cells: Record<string, string> = {};
        g.rows.forEach((row, r) => row.forEach((v, c) => { if (v !== "") cells[cellKey(r, c)] = v; }));
        return { name: g.name || "Sheet1", rows: Math.max(60, g.rows.length), cols, cells, meta: {} };
      });
      commitSheets(file.id, { ...data, sheets, activeSheet: 0 });
    } catch (err) {
      toast(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function doSheetExport(format: string): Promise<void> {
    transfer = null;
    if (!file || !data || !tab) return;
    const base = file.name.replace(/[\\/:*?"<>|]/g, "_");
    switch (format) {
      case "xlsx":
        exportXlsx(base, data.sheets.map((s) => ({ name: s.name, rows: gridOf(s) })));
        break;
      case "ods":
        exportOds(base, data.sheets.map((s) => ({ name: s.name, rows: gridOf(s) })));
        break;
      case "csv":
        await saveFileDialog(`${base}.csv`, toCsv(gridOf(tab)));
        break;
      case "tsv":
        await saveFileDialog(`${base}.tsv`, toCsv(gridOf(tab), "\t"));
        break;
      case "json":
        exportJson(base, data);
        break;
    }
  }
  // ── Async dialogs + toasts (Tauri's webview has no window.prompt/alert) ──
  let sheetAsk: null | { kind: "prompt" | "confirm"; title: string; value: string; placeholder: string; resolve: (v: string | null) => void } = null;
  let askInput: HTMLInputElement | undefined;

  function sheetPrompt(title: string, value = "", placeholder = ""): Promise<string | null> {
    return new Promise((resolve) => {
      sheetAsk = { kind: "prompt", title, value, placeholder, resolve };
      setTimeout(() => askInput?.focus(), 30);
    });
  }

  function sheetConfirm(title: string): Promise<string | null> {
    return new Promise((resolve) => {
      sheetAsk = { kind: "confirm", title, value: "", placeholder: "", resolve };
    });
  }

  function askOk(): void {
    sheetAsk?.resolve(sheetAsk.kind === "prompt" ? sheetAsk.value : "ok");
    sheetAsk = null;
  }

  function askCancel(): void {
    sheetAsk?.resolve(null);
    sheetAsk = null;
  }

  let toasts: { id: number; msg: string }[] = [];
  let toastSeq = 0;
  function toast(msg: string): void {
    const id = ++toastSeq;
    toasts = [...toasts, { id, msg }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 2600);
  }

  let findText = "";
  let replaceText = "";
  let newName = "";
  let newRange = "";
  let ddOptions = "";
  let noteText = "";
  let statsCol: { col: string; sum: number; avg: number; min: number; max: number; count: number } | null = null;
  let emojiTarget = "";

  const EMOJIS = ["✅","❌","⭐","🔥","👍","🚀","💡","📌","📈","📊","🎯","⚠️","💡","🟢","🟡","🔴","❤️","🙏","😎","🤖"];

  function inputVal(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }

  function scrollTopOf(e: Event): number {
    return (e.currentTarget as HTMLDivElement).scrollTop;
  }

  function range(a: number, b: number): number[] {
    const out: number[] = [];
    for (let i = a; i < b; i++) out.push(i);
    return out;
  }

  $: startRow = Math.max(0, Math.floor(scrollTop / ROW_H) - 10);
  $: endRow = Math.min(tab?.rows ?? 0, Math.ceil((scrollTop + viewportH) / ROW_H) + 10);
  $: visibleRows = tab ? range(startRow, endRow) : [];

  // ── Meta accessors ──────────────────────────────────────────────

  function metasOf(t: SheetTab): Record<string, CellMeta> {
    return t.meta ?? {};
  }

  function metaOf(key: string): CellMeta {
    return tab ? metasOf(tab)[key] ?? {} : {};
  }

  function patchMeta(patch: Partial<CellMeta>, targetRow = selRow, targetCol = selCol): void {
    if (!file || !data || !tab) return;
    const key = cellKey(targetRow, targetCol);
    const metas = { ...metasOf(tab) };
    metas[key] = { ...(metas[key] ?? {}), ...patch };
    if (Object.values(metas[key] as Record<string, unknown>).every((v) => v === undefined)) delete metas[key];
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, meta: metas };
    commitSheets(file.id, { ...data, sheets });
  }

  /** Apply a value to a cell keeping the current meta (b/i/fmt persist). */
  function commit(): void {
    if (!file || !data || !tab) return;
    const key = cellKey(editAnchorRow, editAnchorCol);
    const cells = { ...tab.cells };
    const v = editValue.trim();
    if (v === "") delete cells[key];
    else cells[key] = v;
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
  }

  function startEdit(initial?: string, inGrid = true): void {
    if (!tab) return;
    editValue = initial ?? tab.cells[cellKey(selRow, selCol)] ?? "";
    editing = true;
    editingInGrid = inGrid;
    showSuggestions = false;
    rangeAnchor = null;
    rangeCursor = null;
    editAnchorRow = selRow;
    editAnchorCol = selCol;
    if (inGrid) {
      const wantsFormula = editValue.startsWith("=");
      requestAnimationFrame(() => (wantsFormula ? gridFormulaInput : cellEditInput)?.focus());
    }
  }

  function stopEdit(commitValue: boolean): void {
    if (commitValue) commit();
    editing = false;
    editValue = "";
    showSuggestions = false;
    rangeAnchor = null;
    rangeCursor = null;
  }

  function move(dr: number, dc: number): void {
    if (!tab) return;
    selRow = Math.min(Math.max(0, selRow + dr), tab.rows - 1);
    selCol = Math.min(Math.max(0, selCol + dc), tab.cols - 1);
    editing = false;
    scrollCellIntoView();
  }

  function scrollCellIntoView(): void {
    const y = selRow * ROW_H;
    if (y < scrollTop + HEAD_H) container?.scrollTo({ top: Math.max(0, y - HEAD_H) });
    else if (y + ROW_H > scrollTop + viewportH) container?.scrollTo({ top: y + ROW_H - viewportH });
  }

  // ── Formula editing internals ───────────────────────────────────

  function inFormula(): boolean {
    return editing && editValue.startsWith("=");
  }

  function pointedRef(): string {
    const t = rangeCursor ?? { row: selRow, col: selCol };
    if (rangeAnchor && rangeCursor) {
      const a = cellKey(Math.min(rangeAnchor.row, rangeCursor.row), Math.min(rangeAnchor.col, rangeCursor.col));
      const b = cellKey(Math.max(rangeAnchor.row, rangeCursor.row), Math.max(rangeAnchor.col, rangeCursor.col));
      return `${a}:${b}`;
    }
    return cellKey(t.row, t.col);
  }

  function spliceRef(): void {
    const ref = pointedRef();
    const el = editingInGrid ? gridFormulaInput : formulaInput;
    let head = editValue;
    let tail = "";
    if (el) {
      const pos = el.selectionStart ?? editValue.length;
      const before = editValue.slice(0, pos);
      const refMatch = /(?:[A-Z]+[0-9]+(?::[A-Z]+[0-9]+)?)$/.exec(before);
      if (refMatch) {
        head = editValue.slice(0, pos - refMatch[0].length);
        tail = editValue.slice(pos);
      } else {
        head = before;
        tail = editValue.slice(pos);
      }
    }
    editValue = head + ref + tail;
    requestAnimationFrame(() => {
      if (el) {
        const pos = (head + ref).length;
        el.setSelectionRange(pos, pos);
      }
    });
  }

  function formulaArrow(e: KeyboardEvent): boolean {
    if (!inFormula() || !tab) return false;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return false;
    e.preventDefault();
    const dr = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    const dc = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!rangeCursor) rangeCursor = { row: editAnchorRow, col: editAnchorCol };
    rangeCursor = {
      row: Math.min(Math.max(0, rangeCursor.row + dr), tab.rows - 1),
      col: Math.min(Math.max(0, rangeCursor.col + dc), tab.cols - 1)
    };
    rangeAnchor = e.shiftKey ? (rangeAnchor ?? { row: editAnchorRow, col: editAnchorCol }) : null;
    spliceRef();
    selRow = rangeCursor.row;
    selCol = rangeCursor.col;
    scrollCellIntoView();
    return true;
  }

  function onFormulaInput(): void {
    const v = editValue;
    if (v.startsWith("=") && editingInGrid && document.activeElement !== gridFormulaInput) {
      requestAnimationFrame(() => gridFormulaInput?.focus());
    }
    if (!v.startsWith("=")) { showSuggestions = false; return; }
    const m = /(?:=|\(|,)\s*([A-Za-z]*)$/.exec(v);
    if (m) {
      suggestions = suggestFunctions(m[1] ?? "");
      showSuggestions = suggestions.length > 0;
      suggestionIndex = 0;
    } else showSuggestions = false;
  }

  function applySuggestion(fnName: string): void {
    editValue = editValue.replace(/([A-Za-z]*)$/, `${fnName}(`);
    showSuggestions = false;
    (editingInGrid ? gridFormulaInput : formulaInput)?.focus();
  }

  function onCellClick(r: number, c: number, e: MouseEvent): void {
    if (editing && formulaMode && editingInGrid) {
      e.preventDefault();
      if (!e.shiftKey) { rangeCursor = { row: r, col: c }; rangeAnchor = null; }
      else if (rangeCursor) { rangeAnchor = rangeAnchor ?? { row: editAnchorRow, col: editAnchorCol }; rangeCursor = { row: r, col: c }; }
      spliceRef();
      gridFormulaInput?.focus();
      return;
    }
    if (editing) stopEdit(true);
    if (e.shiftKey) {
      if (!rangeStart) rangeStart = { row: selRow, col: selCol };
    } else {
      rangeStart = null;
    }
    selRow = r;
    selCol = c;
  }

  function onGridKeydown(e: KeyboardEvent): void {
    if (!tab || editing) return;
    const mod = isMod(e);
    if (mod) {
      const k = e.key.toLowerCase();
      if (k === "c") { e.preventDefault(); void copySelection(false); return; }
      if (k === "x") { e.preventDefault(); void copySelection(true); return; }
      if (k === "v") { e.preventDefault(); void pasteFromClipboard(); return; }
      if (k === "d") { e.preventDefault(); fillDown(); return; }
      if (k === "r") { e.preventDefault(); fillRight(); return; }
      return; // other mod combos (undo/redo/find…) are app-level
    }
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); move(-1, 0); break;
      case "ArrowDown": e.preventDefault(); move(1, 0); break;
      case "ArrowLeft": e.preventDefault(); move(0, -1); break;
      case "ArrowRight": e.preventDefault(); move(0, 1); break;
      case "Enter": e.preventDefault(); startEdit(); break;
      case "Tab": e.preventDefault(); move(0, e.shiftKey ? -1 : 1); break;
      case "Delete":
      case "Backspace": e.preventDefault(); clearSelection(); break;
      case "F2": e.preventDefault(); startEdit(); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); startEdit(e.key); }
    }
  }

  function onEditKeydown(e: KeyboardEvent): void {
    if (showSuggestions && !e.shiftKey && ["ArrowDown", "ArrowUp"].includes(e.key) && !editValue.endsWith("(")) {
      e.preventDefault();
      suggestionIndex = e.key === "ArrowDown" ? Math.min(suggestionIndex + 1, suggestions.length - 1) : Math.max(suggestionIndex - 1, 0);
      return;
    }
    if (showSuggestions && e.key === "Tab" && !e.shiftKey) { e.preventDefault(); applySuggestion(suggestions[suggestionIndex]?.name ?? ""); return; }
    if (formulaArrow(e)) { showSuggestions = false; return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = e.shiftKey ? -1 : 1;
      stopEdit(true);
      if (editingInGrid) selRow = Math.min(Math.max(0, editAnchorRow + target), (tab?.rows ?? 1) - 1);
      else move(target, 0);
    } else if (e.key === "Tab") { e.preventDefault(); stopEdit(true); move(0, e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); stopEdit(false); }
  }

  // ── Display values with number formats ──────────────────────────

  let display: Record<string, string> = {};
  $: if (tab) computeDisplay(tab);

  function fmtValue(raw: CellValue, m: CellMeta | undefined): string {
    const base = displayValue(raw);
    if (typeof raw !== "number" || !m?.fmt || m.fmt === "auto") return base;
    switch (m.fmt) {
      case "number": return raw.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case "currency": return raw.toLocaleString(undefined, { style: "currency", currency: "USD" });
      case "percent": return `${(raw * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
      case "round0": return String(Math.round(raw));
      case "round2": return raw.toFixed(2);
      default: return base;
    }
  }

  function computeDisplay(t: SheetTab): void {
    const out: Record<string, string> = {};
    const metas = metasOf(t);
    for (const key of Object.keys(t.cells)) {
      if (t.cells[key] === "") continue;
      try {
        out[key] = fmtValue(evaluateCell(t, key, data, data?.names), metas[key]);
      } catch {
        out[key] = ERROR;
      }
    }
    display = out;
  }

  function cellStyle(key: string): string {
    const m = metaOf(key);
    let s = "";
    if (m.b) s += "font-weight:700;";
    if (m.i) s += "font-style:italic;";
    if (m.color) s += `color:${m.color};`;
    if (m.bg) s += `background:${m.bg};`;
    const raw = tab?.cells[key] ?? "";
    const computed = display[key] ?? "";
    // Numbers default right-aligned (OnlyOffice/Sheets behavior) unless overridden.
    const isNum = raw !== "" && computed !== "" && !Number.isNaN(parseFloat(computed.replace(/[$,%]/g, ""))) && !raw.startsWith("=") || /^=[A-Z]+[0-9]+$/.test(raw) && computed !== "" && !Number.isNaN(parseFloat(computed));
    if (m.align) s += `justify-content:${m.align === "center" ? "center" : m.align === "right" ? "flex-end" : "flex-start"};`;
    else if (isNum) s += "justify-content:flex-end;";
    return s;
  }

  // ── Rows / columns insert & delete ──────────────────────────────

  function remapAfterInsert(kind: "row" | "col", at: number): void {
    if (!file || !data || !tab) return;
    const cells: Record<string, string> = {};
    const metas: Record<string, CellMeta> = {};
    for (const [key, v] of Object.entries(tab.cells)) {
      const m = /^([A-Z]+)([0-9]+)$/.exec(key);
      if (!m) continue;
      const colN = nameToColNum(m[1]);
      const rowN = parseInt(m[2], 10) - 1;
      const c = kind === "row" ? rowN : colN;
      if (c >= at) {
        const nn = c + 1;
        const nk = kind === "row" ? `${m[1]}${nn + 1}` : `${colName(colN === undefined ? 0 : nn)}${rowN + 1}`;
        cells[nk] = v;
        if (tab.meta?.[key]) metas[nk] = tab.meta[key];
      } else {
        cells[key] = v;
        if (tab.meta?.[key]) metas[key] = tab.meta[key];
      }
    }
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = {
      ...tab,
      cells,
      meta: Object.keys(metas).length ? metas : undefined,
      rows: kind === "row" ? tab.rows + 1 : tab.rows,
      cols: kind === "col" ? tab.cols + 1 : tab.cols
    };
    commitSheets(file.id, { ...data, sheets });
  }

  function nameToColNum(name: string): number {
    let n = 0;
    for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function colName(col: number): string {
    let s = "";
    let c = col;
    while (c >= 0) { s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26) - 1; }
    return s;
  }

  function insertRow(at: number): void { remapAfterInsert("row", at); }
  function insertCol(at: number): void { remapAfterInsert("col", at); }

  function deleteRow(at: number): void { removeLine("row", at); }
  function deleteCol(at: number): void { removeLine("col", at); }

  function removeLine(kind: "row" | "col", at: number): void {
    if (!file || !data || !tab) return;
    const cells: Record<string, string> = {};
    const metas: Record<string, CellMeta> = {};
    for (const [key, v] of Object.entries(tab.cells)) {
      const m = /^([A-Z]+)([0-9]+)$/.exec(key);
      if (!m) continue;
      const colN = nameToColNum(m[1]);
      const rowN = parseInt(m[2], 10) - 1;
      const c = kind === "row" ? rowN : colN;
      if (c === at) continue; // deleted
      const nn = c > at ? c - 1 : c;
      const nk = kind === "row" ? `${m[1]}${nn + 1}` : `${colName(nn)}${rowN + 1}`;
      cells[nk] = v;
      if (tab.meta?.[key]) metas[nk] = tab.meta[key];
    }
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = {
      ...tab,
      cells,
      meta: Object.keys(metas).length ? metas : undefined,
      rows: kind === "row" ? Math.max(1, tab.rows - 1) : tab.rows,
      cols: kind === "col" ? Math.max(1, tab.cols - 1) : tab.cols
    };
    commitSheets(file.id, { ...data, sheets });
  }

  // ── Data tools ──────────────────────────────────────────────────

  function sortByCol(dir: "asc" | "desc"): void {
    if (!file || !data || !tab) return;
    const entries: { r: number; v: CellValue }[] = [];
    for (let r = 0; r < tab.rows; r++) {
      const key = cellKey(r, selCol);
      const raw = tab.cells[key];
      if (raw === undefined || raw === "") continue;
      entries.push({ r, v: raw.startsWith("=") ? (() => { try { return evaluateCell(tab, key, data, data.names); } catch { return ERROR; } })() : raw });
    }
    entries.sort((a, b) => {
      const na = typeof a.v === "number" ? a.v : parseFloat(String(a.v));
      const nb = typeof b.v === "number" ? b.v : parseFloat(String(b.v));
      const bothNum = !Number.isNaN(na) && !Number.isNaN(nb);
      const cmp = bothNum ? na - nb : String(a.v).localeCompare(String(b.v));
      return dir === "asc" ? cmp : -cmp;
    });
    const order = new Map<number, number>();
    let ei = 0;
    for (let r = 0; r < tab.rows; r++) {
      if (tab.cells[cellKey(r, selCol)] !== undefined) order.set(r, entries[ei++].r);
    }
    const cells: Record<string, string> = {};
    for (let c = 0; c < tab.cols; c++) {
      for (let r = 0; r < tab.rows; r++) {
        const src = order.get(r);
        if (src === undefined) continue;
        const srcKey = cellKey(src, c);
        if (tab.cells[srcKey] !== undefined) cells[cellKey(r, c)] = tab.cells[srcKey];
      }
    }
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
  }

  function toggleFilter(): void {
    if (!file || !data || !tab) return;
    const on = tab.filterCol === null || tab.filterCol === undefined;
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, filterCol: on ? selCol : null, filterText: on ? "" : undefined };
    commitSheets(file.id, { ...data, sheets });
  }

  $: filteredRows = (() => {
    if (!tab || tab.filterCol === null || tab.filterCol === undefined || !tab.filterText) return null;
    const q = tab.filterText.toLowerCase();
    return (r: number) => {
      const v = display[cellKey(r, tab.filterCol!)] ?? tab.cells[cellKey(r, tab.filterCol!)] ?? "";
      return v.toLowerCase().includes(q);
    };
  })();

  function trimWhitespace(): void {
    if (!file || !data || !tab) return;
    const cells = { ...tab.cells };
    let n = 0;
    for (const [k, v] of Object.entries(cells)) {
      if (typeof v === "string" && v !== v.trim()) { cells[k] = v.trim(); n++; }
    }
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
    toast(`Trimmed whitespace in ${n} cell(s).`);
  }

  function removeDuplicates(): void {
    if (!file || !data || !tab) return;
    const seen = new Set<string>();
    const drop = new Set<number>();
    for (let r = 0; r < tab.rows; r++) {
      const rowVals: string[] = [];
      for (let c = 0; c < tab.cols; c++) rowVals.push(tab.cells[cellKey(r, c)] ?? "");
      const sig = rowVals.join("");
      if (sig && seen.has(sig)) drop.add(r);
      else if (sig) seen.add(sig);
    }
    if (drop.size === 0) { toast("No duplicates found."); return; }
    const cells: Record<string, string> = {};
    let w = 0;
    for (let r = 0; r < tab.rows; r++) {
      if (drop.has(r)) continue;
      for (let c = 0; c < tab.cols; c++) {
        const v = tab.cells[cellKey(r, c)];
        if (v !== undefined) cells[cellKey(w, c)] = v;
      }
      w++;
    }
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
    toast(`Removed ${drop.size} duplicate row(s).`);
  }

  function splitToColumns(): void {
    if (!file || !data || !tab) return;
    void sheetPrompt("Split on character", ",", ",").then((sep) => {
      if (!sep || !file || !data || !tab) return;
      const cells = { ...tab.cells };
      const src = cellKey(selRow, selCol);
      const parts = (cells[src] ?? "").split(sep);
      delete cells[src];
      parts.forEach((p, i) => {
        if (p !== "") cells[cellKey(selRow, selCol + i)] = p.trim();
      });
      const sheets = [...data.sheets];
      sheets[data.activeSheet] = { ...tab, cells, cols: Math.max(tab.cols, selCol + parts.length) };
      commitSheets(file.id, { ...data, sheets });
    });
  }

  function columnStats(): void {
    if (!tab) return;
    const nums: number[] = [];
    for (let r = 0; r < tab.rows; r++) {
      const key = cellKey(r, selCol);
      const raw = tab.cells[key];
      if (!raw) continue;
      const v = raw.startsWith("=") ? (() => { try { return evaluateCell(tab, key, data, data?.names); } catch { return null; } })() : parseFloat(raw);
      if (typeof v === "number" && Number.isFinite(v)) nums.push(v);
    }
    const col = colToName(selCol);
    statsCol = {
      col,
      sum: nums.reduce((a, b) => a + b, 0),
      avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
      min: nums.length ? Math.min(...nums) : 0,
      max: nums.length ? Math.max(...nums) : 0,
      count: nums.length
    };
    dialog = "stats";
  }

  function freeze(kind: "row" | "col" | "none"): void {
    if (!file || !data || !tab) return;
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = {
      ...tab,
      frozenRows: kind === "row" ? 1 : 0,
      frozenCols: kind === "col" ? 1 : 0
    };
    commitSheets(file.id, { ...data, sheets });
  }

  // ── Sheets (tabs) management ────────────────────────────────────

  function addSheet(): void {
    if (!file || !data) return;
    const sheets = [...data.sheets, { name: `Sheet${data.sheets.length + 1}`, rows: 60, cols: 18, cells: {} }];
    commitSheets(file.id, { ...data, sheets, activeSheet: sheets.length - 1 });
  }

  function selectSheet(i: number): void {
    if (!file || !data) return;
    updateContent(file.id, { ...data, activeSheet: i });
    selRow = 0; selCol = 0;
  }

  function renameSheet(i: number): void {
    if (!file || !data) return;
    void sheetPrompt("Sheet name", data.sheets[i].name).then((name) => {
      if (!name || !file || !data) return;
      const sheets = [...data.sheets];
      sheets[i] = { ...sheets[i], name };
      commitSheets(file.id, { ...data, sheets });
    });
  }

  function duplicateSheet(i: number): void {
    if (!file || !data) return;
    const src = data.sheets[i];
    const copy = { ...src, name: `Copy of ${src.name}`, cells: { ...src.cells }, meta: src.meta ? { ...src.meta } : undefined };
    const sheets = [...data.sheets];
    sheets.splice(i + 1, 0, copy);
    commitSheets(file.id, { ...data, sheets });
  }

  function hideSheet(i: number): void {
    if (!file || !data || data.sheets.length <= 1) return;
    const sheets = data.sheets.map((s, k) => (k === i ? { ...s, hidden: true } : s));
    const nextActive = sheets.findIndex((s) => !s.hidden);
    updateContent(file.id, { ...data, sheets, activeSheet: Math.max(0, nextActive) });
  }

  function unhideSheets(): void {
    if (!file || !data) return;
    const sheets = data.sheets.map((s) => ({ ...s, hidden: false }));
    updateContent(file.id, { ...data, sheets });
  }

  function deleteSheet(i: number): void {
    if (!file || !data || data.sheets.length <= 1) return;
    void sheetConfirm(`Delete sheet "${data.sheets[i].name}"? You can undo with ⌘Z.`).then((ok) => {
      if (!ok || !file || !data) return;
      const sheets = data.sheets.filter((_, k) => k !== i);
      commitSheets(file.id, { ...data, sheets, activeSheet: Math.max(0, Math.min(data.activeSheet, sheets.length - 1)) });
    });
  }

  // ── Import / export / save ──────────────────────────────────────

  function printSheet(): void {
    if (!tab) return;
    const grid: string[][] = [];
    for (let r = 0; r < tab.rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < tab.cols; c++) row.push(display[cellKey(r, c)] ?? tab.cells[cellKey(r, c)] ?? "");
      grid.push(row);
    }
    const html = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font:11pt Arial">${grid
      .map((row) => `<tr>${row.map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`)
      .join("")}</table>`;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(file?.name ?? "Sheet")}</title></head><body>${html}<script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
    w.document.close();
  }

  // ── Stats strip ─────────────────────────────────────────────────

  $: stats = tab ? computeStats(tab, display) : { sum: 0, count: 0, avg: 0 };

  function computeStats(t: SheetTab, disp: Record<string, string>): { sum: number; count: number; avg: number } {
    const nums: number[] = [];
    for (const key of Object.keys(t.cells)) {
      const v = disp[key];
      const n = parseFloat(v);
      if (v !== undefined && v !== "" && !Number.isNaN(n)) nums.push(n);
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    return { sum, count: nums.length, avg: nums.length ? sum / nums.length : 0 };
  }

  // ── Command router ──────────────────────────────────────────────

  function insertFunction(fn: string): void { startEdit(`=${fn}(`); }
  function wrapExisting(fn: string): void {
    const raw = tab?.cells[cellKey(selRow, selCol)] ?? "";
    if (!raw) startEdit(`=${fn}(`);
    else if (raw.startsWith("=")) startEdit(`=${fn}(${raw.slice(1)})`);
    else startEdit(`=${fn}(${raw})`);
  }

  function onCommand(e: { cmd: string; payload?: string }): void {
    // Full-id commands (menu items like "file:details", "data:sort-asc") route to
    // the menu handler first; short prefixes ("fn", "fmt", "bg"…) hit the switch.
    const MENU_PREFIXES = ["file:", "edit:", "view:", "insert:", "fmt:", "data:", "tools:", "help:"];
    if (MENU_PREFIXES.some((p) => e.cmd.startsWith(p))) {
      handleMenuCommand(e.cmd);
      return;
    }
    const raw = e.cmd;
    const colon = raw.indexOf(":");
    const cmd = colon === -1 ? raw : raw.slice(0, colon);
    const arg = colon === -1 ? e.payload : raw.slice(colon + 1);
    switch (cmd) {
      case "fn": insertFunction(arg ?? "SUM"); break;
      case "wrap": wrapExisting(arg ?? "SUM"); break;
      case "zoom": gridZoom = parseInt(arg ?? "100", 10); break;
      case "fmt": patchMeta({ fmt: (arg as CellMeta["fmt"]) ?? "auto" }); break;
      case "bold": patchMeta({ b: !metaOf(cellKey(selRow, selCol)).b }); break;
      case "italic": patchMeta({ i: !metaOf(cellKey(selRow, selCol)).i }); break;
      case "strike": patchMeta({ strike: true } as Partial<CellMeta>); break;
      case "color": patchMeta({ color: arg }); break;
      case "bg": patchMeta({ bg: arg }); break;
      case "size": break; // per-cell font size omitted for lightness
      case "print": printSheet(); break;
      case "paint": break;
      case "undo": if (!sheetsUndo()) document.execCommand("undo"); break;
      case "redo": if (!sheetsRedo()) document.execCommand("redo"); break;
      case "data:filter": toggleFilter(); break;
      default:
        // Full-id commands (menu items)
        handleMenuCommand(raw);
    }
  }

  function handleMenuCommand(id: string): void {
    switch (id) {
      case "file:new": window.dispatchEvent(new CustomEvent("sos:new-sheet")); break;
      case "file:open": window.dispatchEvent(new CustomEvent("sos:open-request")); break;
      case "file:import": transfer = "import"; break;
      case "file:download": transfer = "export"; break;
      case "file:copy": if (file) import("../../lib/state").then((m) => m.duplicateFile(file.id)); break;
      case "file:dl-csv": void doSheetExport("csv"); break;
      case "file:dl-json": if (file) download(`${file.name.replace(/[\\/:*?"<>|]/g, "_")}.json`, JSON.stringify(file, null, 2), "application/json"); break;
      case "file:save": window.dispatchEvent(new CustomEvent("sos:save-request")); break;
      case "file:rename": void sheetPrompt("Rename spreadsheet", file?.name ?? "").then((n) => { if (n && file) import("../../lib/state").then((m) => m.renameFile(file.id, n)); }); break;
      case "file:details": dialog = "details"; break;
      case "file:trash": if (file) import("../../lib/state").then((m) => m.trashFile(file.id)); break;
      case "file:print": printSheet(); break;
      case "undo": if (!sheetsUndo()) document.execCommand("undo"); break;
      case "redo": if (!sheetsRedo()) document.execCommand("redo"); break;
      case "edit:find": dialog = "find"; break;
      case "edit:cut": void copySelection(true); break;
      case "edit:copy": void copySelection(false); break;
      case "edit:paste": void pasteFromClipboard(); break;
      case "edit:fill-down": fillDown(); break;
      case "edit:fill-right": fillRight(); break;
      case "edit:clear": clearSelection(); break;
      case "view:freeze-row": freeze("row"); break;
      case "view:freeze-col": freeze("col"); break;
      case "view:unfreeze": freeze("none"); break;
      case "view:zoom-in": gridZoom = Math.min(200, gridZoom + 10); break;
      case "view:zoom-out": gridZoom = Math.max(50, gridZoom - 10); break;
      case "view:zoom-reset": gridZoom = 100; break;
      case "view:fullscreen": document.documentElement.requestFullscreen?.().catch(() => {}); break;
      case "insert:row-above": insertRow(selRow); break;
      case "insert:row-below": insertRow(selRow + 1); break;
      case "insert:col-left": insertCol(selCol); break;
      case "insert:col-right": insertCol(selCol + 1); break;
      case "insert:sheet": addSheet(); break;
      case "insert:checkbox": patchMeta({ checkbox: true }); break;
      case "insert:dropdown": ddOptions = metaOf(cellKey(selRow, selCol)).dropdown?.join(", ") ?? ""; dialog = "dropdown"; break;
      case "insert:note": noteText = metaOf(cellKey(selRow, selCol)).note ?? ""; dialog = "note"; break;
      case "insert:function": insertFunction("SUM"); break;
      case "insert:chart":
        chartDraft = selRange
          ? `${cellKey(selRange.r0, selRange.c0)}:${cellKey(selRange.r1, selRange.c1)}`
          : "";
        dialog = "chart";
        break;
      case "insert:link": void sheetPrompt("Link URL").then((url) => { if (url) patchMeta({ note: url }); }); break;
      case "insert:emoji": emojiTarget = "cell"; dialog = "emoji"; break;
      case "insert:date": { editValue = new Date().toLocaleDateString(); commit(); break; }
      case "fmt:bold": patchMeta({ b: !metaOf(cellKey(selRow, selCol)).b }); break;
      case "fmt:italic": patchMeta({ i: !metaOf(cellKey(selRow, selCol)).i }); break;
      case "fmt:strike": patchMeta({ strike: true } as Partial<CellMeta>); break;
      case "fmt:number": patchMeta({ fmt: "number" }); break;
      case "fmt:currency": patchMeta({ fmt: "currency" }); break;
      case "fmt:percent": patchMeta({ fmt: "percent" }); break;
      case "fmt:round0": patchMeta({ fmt: "round0" }); break;
      case "fmt:round2": patchMeta({ fmt: "round2" }); break;
      case "fmt:auto": patchMeta({ fmt: "auto" }); break;
      case "fmt:color": void sheetPrompt("Text color (hex)", "#ff0000").then((c) => { if (c) patchMeta({ color: c }); }); break;
      case "fmt:bg": void sheetPrompt("Fill color (hex)", "#fff2cc").then((c) => { if (c) patchMeta({ bg: c }); }); break;
      case "fmt:align-left": patchMeta({ align: "left" } as Partial<CellMeta>); break;
      case "fmt:align-center": patchMeta({ align: "center" } as Partial<CellMeta>); break;
      case "fmt:align-right": patchMeta({ align: "right" } as Partial<CellMeta>); break;
      case "fmt:clear": patchMeta({ b: undefined, i: undefined, color: undefined, bg: undefined, fmt: undefined }); break;
      case "data:sort-asc": sortByCol("asc"); break;
      case "data:sort-desc": sortByCol("desc"); break;
      case "data:filter": toggleFilter(); break;
      case "data:cleanup-trim": trimWhitespace(); break;
      case "data:cleanup-dedupe": removeDuplicates(); break;
      case "data:split": splitToColumns(); break;
      case "data:stats": columnStats(); break;
      case "data:named-range": { newName = ""; newRange = selRange ? `${cellKey(selRange.r0, selRange.c0)}:${cellKey(selRange.r1, selRange.c1)}` : `${selKey}:${selKey}`; dialog = "named"; break; }
      case "data:validate": dialog = "validate"; break;
      case "tools:form": window.dispatchEvent(new CustomEvent("sos:new-form")); break;
      case "tools:macro": toast("Macros: use File → Make a copy to script batch edits."); break;
      case "tools:stats": columnStats(); break;
      case "tools:protect": dialog = "protect"; break;
      case "help:search": dialog = "find"; break;
      case "help:fnlist": dialog = "fnlist"; break;
      case "help:shortcuts": dialog = "shortcuts"; break;
      case "help:about": toast("Simple Office Suite v1.3.0 — offline-first, MIT licensed."); break;
    }
  }

  function fillDown(): void {
    if (!file || !data || !tab || selRow === 0) return;
    const cells = { ...tab.cells };
    const src = cells[cellKey(selRow - 1, selCol)];
    if (src !== undefined) cells[cellKey(selRow, selCol)] = src;
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
  }

  function fillRight(): void {
    if (!file || !data || !tab || selCol === 0) return;
    const cells = { ...tab.cells };
    const src = cells[cellKey(selRow, selCol - 1)];
    if (src !== undefined) cells[cellKey(selRow, selCol)] = src;
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
  }

  function findNextCell(): void {
    if (!findText || !tab) return;
    const q = findText.toLowerCase();
    for (let r = 0; r < tab.rows; r++) {
      for (let c = 0; c < tab.cols; c++) {
        const v = (display[cellKey(r, c)] ?? tab.cells[cellKey(r, c)] ?? "").toLowerCase();
        if (v.includes(q)) { selRow = r; selCol = c; scrollCellIntoView(); return; }
      }
    }
    toast(`"${findText}" not found.`);
  }

  function replaceAllCells(): void {
    if (!findText || !tab || !file || !data) return;
    const re = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const cells = { ...tab.cells };
    let n = 0;
    for (const [k, v] of Object.entries(cells)) {
      if (re.test(v)) { cells[k] = v.replace(re, replaceText); n++; }
      re.lastIndex = 0;
    }
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
    toast(`Replaced in ${n} cell(s).`);
  }

  $: selKey = cellKey(selRow, selCol);
  $: selRaw = tab?.cells[selKey] ?? "";
  $: selRange = rangeStart
    ? {
        r0: Math.min(rangeStart.row, selRow), r1: Math.max(rangeStart.row, selRow),
        c0: Math.min(rangeStart.col, selCol), c1: Math.max(rangeStart.col, selCol)
      }
    : null;

  function checkboxVal(e: Event): boolean {
    return (e.currentTarget as HTMLInputElement).checked;
  }

  function selectOpt(e: Event): string {
    return (e.currentTarget as HTMLSelectElement).value;
  }

  function setCellValue(key: string, v: string): void {
    if (!file || !data || !tab) return;
    const cells = { ...tab.cells };
    if (v === "") delete cells[key];
    else cells[key] = v;
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
  }

  // ── Named ranges ────────────────────────────────────────────────

  function addNamedRange(): void {
    if (!file || !data) return;
    const name = newName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    const ref = newRange.trim().toUpperCase();
    if (!name || !ref) { toast("Enter both a name and a range."); return; }
    if (!parseRangeText(ref)) { toast("Range must look like A1:B5."); return; }
    const names = { ...(data.names ?? {}), [name]: ref };
    commitSheets(file.id, { ...data, names });
    newName = "";
    toast(`${name} → ${ref}`);
  }

  function removeNamedRange(name: string): void {
    if (!file || !data) return;
    const names = { ...(data.names ?? {}) };
    delete names[name];
    commitSheets(file.id, { ...data, names });
  }

  // ── Charts ──────────────────────────────────────────────────────

  function parseRangeText(text: string): SheetChart["range"] | null {
    const norm = text.trim().toUpperCase().replace(/\$/g, "");
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(norm);
    if (!m) return null;
    const cA = nameToColNum(m[1]);
    const rA = parseInt(m[2], 10) - 1;
    const cB = m[3] ? nameToColNum(m[3]) : cA;
    const rB = m[4] ? parseInt(m[4], 10) - 1 : rA;
    return { r0: Math.min(rA, rB), r1: Math.max(rA, rB), c0: Math.min(cA, cB), c1: Math.max(cA, cB) };
  }

  function addChart(kind: string, range: string, title: string): void {
    if (!file || !data || !tab) return;
    const parsed = parseRangeText(range);
    if (!parsed) {
      toast("Invalid range — use a rectangle like A1:B5.");
      return;
    }
    const chart: SheetChart = {
      id: uid(),
      kind: kind as SheetChart["kind"],
      range: parsed,
      title: title || "Chart",
      anchor: { row: Math.min(Math.max(0, selRow + 1), Math.max(0, tab.rows - 8)), col: 2 }
    };
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, charts: [...(tab.charts ?? []), chart] };
    commitSheets(file.id, { ...data, sheets });
    dialog = null;
  }

  function removeChart(id: string): void {
    if (!file || !data || !tab) return;
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, charts: (tab.charts ?? []).filter((ch) => ch.id !== id) };
    commitSheets(file.id, { ...data, sheets });
  }

  const CHART_COLORS = ["#4285f4", "#ea4335", "#fbbc05", "#34a853", "#a142f4", "#24c1e0"];

  interface ChartSeries {
    name: string;
    color: string;
    values: number[];
  }

  /** Extract labels + numeric series from the sheet for a chart range. */
  function chartData(rng: SheetChart["range"]): { labels: string[]; series: ChartSeries[] } {
    if (!tab) return { labels: [], series: [] };
    const disp = (r: number, c: number): string => display[cellKey(r, c)] ?? tab!.cells[cellKey(r, c)] ?? "";
    const numOf = (s: string): number => {
      const n = parseFloat(s.replace(/[$,%\s]/g, ""));
      return Number.isNaN(n) ? 0 : n;
    };
    const isNum = (s: string): boolean => s !== "" && !Number.isNaN(parseFloat(s.replace(/[$,%\s]/g, "")));

    // Label column: when the first column is mostly non-numeric text (and
    // another column exists), treat it as category labels.
    let labelCol = -1;
    let firstDataCol = rng.c0;
    if (rng.c1 > rng.c0) {
      let nonNum = 0;
      let num = 0;
      for (let r = rng.r0; r <= rng.r1; r++) {
        const v = disp(r, rng.c0);
        if (v === "") continue;
        if (isNum(v)) num++;
        else nonNum++;
      }
      if (nonNum > num) {
        labelCol = rng.c0;
        firstDataCol = rng.c0 + 1;
      }
    }

    // Header row: when the first data column's top cell is non-numeric text.
    let headerRow = -1;
    let firstDataRow = rng.r0;
    const topLeft = disp(rng.r0, firstDataCol);
    if (rng.r1 > rng.r0 && topLeft !== "" && !isNum(topLeft)) {
      headerRow = rng.r0;
      firstDataRow = rng.r0 + 1;
    }

    const labels: string[] = [];
    for (let r = firstDataRow; r <= rng.r1; r++) {
      labels.push(labelCol >= 0 ? disp(r, labelCol) || String(r + 1) : String(r + 1));
    }

    const series: ChartSeries[] = [];
    for (let c = firstDataCol; c <= rng.c1; c++) {
      series.push({
        name: headerRow >= 0 ? disp(headerRow, c) || colToName(c) : colToName(c),
        color: CHART_COLORS[series.length % CHART_COLORS.length],
        values: labels.map((_, i) => numOf(disp(firstDataRow + i, c)))
      });
    }
    return { labels, series };
  }

  function chartX(e: MouseEvent): number {
    return e.clientX - container.getBoundingClientRect().left + container.scrollLeft;
  }

  function chartY(e: MouseEvent): number {
    return e.clientY - container.getBoundingClientRect().top + container.scrollTop;
  }

  function startChartDrag(e: MouseEvent, ch: SheetChart): void {
    draggingChart = ch.id;
    dragOffX = chartX(e) - (64 + ch.anchor.col * COL_W);
    dragOffY = chartY(e) - (HEAD_H + ch.anchor.row * ROW_H);
    window.addEventListener("mousemove", onChartDrag);
    window.addEventListener("mouseup", endChartDrag, { once: true });
  }

  function onChartDrag(e: MouseEvent): void {
    if (!draggingChart || !file || !data || !tab) return;
    const col = Math.max(0, Math.round((chartX(e) - dragOffX - 64) / COL_W));
    const row = Math.max(0, Math.round((chartY(e) - dragOffY - HEAD_H) / ROW_H));
    const charts = (tab.charts ?? []).map((c) => (c.id === draggingChart ? { ...c, anchor: { row, col } } : c));
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, charts };
    updateContent(file.id, { ...data, sheets }); // view-state drag: bypasses undo history
  }

  function endChartDrag(): void {
    draggingChart = null;
    window.removeEventListener("mousemove", onChartDrag);
    window.removeEventListener("mouseup", endChartDrag);
  }

  function sheetAction(e: Event): void {
    if (!data) return;
    const v = inputVal(e);
    const i = data.activeSheet;
    if (v === "dup") duplicateSheet(i);
    else if (v === "hide") hideSheet(i);
    else if (v === "del") deleteSheet(i);
    else if (v === "show") unhideSheets();
    (e.currentTarget as HTMLSelectElement).value = "";
  }
  // Robust command bridge: menubar/toolbar also emit window events (immune to
  // component-boundary quirks). Deduplicate with the direct onCmd callback.
  let lastCmdAt = 0;
  function onWindowCmd(e: Event): void {
    const t = performance.now();
    if (t - lastCmdAt < 50) return;
    lastCmdAt = t;
    onCommand((e as CustomEvent<{ cmd: string; payload?: string }>).detail);
  }
  function onUndoRequest(): void {
    if (!sheetsUndo()) document.execCommand("undo");
  }
  function onRedoRequest(): void {
    if (!sheetsRedo()) document.execCommand("redo");
  }
  function onFindRequest(): void {
    dialog = "find";
  }
  function onFillDownRequest(): void { fillDown(); }
  function onFillRightRequest(): void { fillRight(); }

  /** Selected block (or single cell) as TSV for clipboard interchange. */
  function selectionTsv(): string {
    if (!tab) return "";
    const r = selRange ?? { r0: selRow, r1: selRow, c0: selCol, c1: selCol };
    const lines: string[] = [];
    for (let row = r.r0; row <= r.r1; row++) {
      const cols: string[] = [];
      for (let c = r.c0; c <= r.c1; c++) cols.push(display[cellKey(row, c)] ?? tab.cells[cellKey(row, c)] ?? "");
      lines.push(cols.join("\t"));
    }
    return lines.join("\n");
  }

  async function copySelection(cut: boolean): Promise<void> {
    const tsv = selectionTsv();
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      // Clipboard API unavailable (insecure context) — fall back silently.
    }
    if (cut && file && data && tab) {
      const r = selRange ?? { r0: selRow, r1: selRow, c0: selCol, c1: selCol };
      const cells = { ...tab.cells };
      for (let row = r.r0; row <= r.r1; row++) for (let c = r.c0; c <= r.c1; c++) delete cells[cellKey(row, c)];
      const sheets = [...data.sheets];
      sheets[data.activeSheet] = { ...tab, cells };
      commitSheets(file.id, { ...data, sheets });
    }
  }

  async function pasteFromClipboard(): Promise<void> {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!text || !file || !data || !tab) return;
    const rows = text.replace(/\r/g, "").split("\n").map((line) => line.split("\t"));
    const cells = { ...tab.cells };
    rows.forEach((rowVals, dr) => {
      rowVals.forEach((v, dc) => {
        if (v === "") return;
        const key = cellKey(selRow + dr, selCol + dc);
        if (selRow + dr < tab!.rows && selCol + dc < tab!.cols) cells[key] = v;
      });
    });
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
  }

  function clearSelection(): void {
    if (!file || !data || !tab) return;
    const r = selRange ?? { r0: selRow, r1: selRow, c0: selCol, c1: selCol };
    const cells = { ...tab.cells };
    for (let row = r.r0; row <= r.r1; row++) for (let c = r.c0; c <= r.c1; c++) delete cells[cellKey(row, c)];
    const sheets = [...data.sheets];
    sheets[data.activeSheet] = { ...tab, cells };
    commitSheets(file.id, { ...data, sheets });
  }

  // Re-register whenever the component's reactive scope re-runs; idempotent because
  // addEventListener deduplicates identical function references.
  $: bridgeRef = registerBridge();
  function registerBridge(): number {
    window.removeEventListener("sos-cmd-sheets", onWindowCmd);
    window.addEventListener("sos-cmd-sheets", onWindowCmd);
    window.removeEventListener("sos:undo-request", onUndoRequest);
    window.addEventListener("sos:undo-request", onUndoRequest);
    window.removeEventListener("sos:redo-request", onRedoRequest);
    window.addEventListener("sos:redo-request", onRedoRequest);
    window.removeEventListener("sos:find-request", onFindRequest);
    window.addEventListener("sos:find-request", onFindRequest);
    window.removeEventListener("sos:fill-down-request", onFillDownRequest);
    window.addEventListener("sos:fill-down-request", onFillDownRequest);
    window.removeEventListener("sos:fill-right-request", onFillRightRequest);
    window.addEventListener("sos:fill-right-request", onFillRightRequest);
    return 1;
  }
  onDestroy(() => {
    window.removeEventListener("sos-cmd-sheets", onWindowCmd);
    window.removeEventListener("sos:undo-request", onUndoRequest);
    window.removeEventListener("sos:redo-request", onRedoRequest);
    window.removeEventListener("sos:find-request", onFindRequest);
    window.removeEventListener("sos:fill-down-request", onFillDownRequest);
    window.removeEventListener("sos:fill-right-request", onFillRightRequest);
  });
</script>

<div class="flex-1 flex flex-col min-h-0 relative" role="grid" tabindex="0" on:keydown={onGridKeydown}>
  <SheetsMenubar onCmd={(d) => onCommand(d)} />
  <SheetsToolbar zoom={gridZoom} onCmd={(d) => onCommand(d)} />

  <!-- Formula bar -->
  <div class="relative h-9 shrink-0 flex items-center gap-2 px-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-[#2d2d2d]/60">
    <span class="min-w-[64px] text-sm font-mono text-center chip bg-gray-100 dark:bg-gray-700">{formulaMode && rangeCursor ? liveRef : selKey}</span>
    <span class="text-gray-400 font-serif italic px-1">fx</span>
    <input
      bind:this={formulaInput}
      class="input flex-1 font-mono"
      placeholder="Enter a value or =SUM(A1:A9) — arrows pick cells while typing a formula"
      value={editing && !editingInGrid ? editValue : formulaMode && editingInGrid ? editValue : selRaw}
      on:focus={() => { if (!editing) startEdit(selRaw, false); }}
      on:input={(e) => { editValue = inputVal(e); onFormulaInput(); }}
      on:keydown={onEditKeydown}
      on:blur={() => { if (editing && !editingInGrid) stopEdit(true); }}
    />
    {#if showSuggestions}
      <div class="absolute z-50 left-[100px] top-[36px] menu !block max-h-[280px] overflow-y-auto shadow-modal">
        {#each suggestions as s, i (s.name)}
          <button class="menu-item {i === suggestionIndex ? 'bg-gray-100 dark:bg-gray-700' : ''}" on:mousedown|preventDefault={() => applySuggestion(s.name)}>
            <span class="font-mono font-semibold">{s.name}</span>
            <span class="text-xs text-gray-500 ml-2 truncate max-w-[280px]">{s.description}</span>
            <span class="ml-auto text-[10px] text-gray-400">{s.category}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Stats strip -->
  <div class="h-6 shrink-0 flex items-center gap-4 px-3 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
    <span>SUM: <b class="text-gray-700 dark:text-gray-200">{stats.sum}</b></span>
    <span>COUNT: <b class="text-gray-700 dark:text-gray-200">{stats.count}</b></span>
    <span>AVG: <b class="text-gray-700 dark:text-gray-200">{Math.round(stats.avg * 100) / 100}</b></span>
    {#if formulaMode && rangeCursor}
      <span class="chip bg-blue-100 dark:bg-blue-900/40 text-docs !text-[10px]">⌨ {liveRef}</span>
    {/if}
    {#if tab?.frozenRows || tab?.frozenCols}
      <span class="chip bg-gray-100 dark:bg-gray-700 !text-[10px]">❄ frozen</span>
    {/if}
    {#if tab?.filterCol !== null && tab?.filterCol !== undefined}
      <input class="input !h-5 !w-40 !text-[10px]" placeholder="Filter column {colToName(tab.filterCol)}…" value={tab.filterText ?? ""} on:input={(e) => { if (!file || !data || !tab) return; const sheets = [...data.sheets]; sheets[data.activeSheet] = { ...tab, filterText: inputVal(e) }; updateContent(file.id, { ...data, sheets }); }} />
    {/if}
  </div>

  <!-- Virtualized grid -->
  <div class="flex-1 overflow-auto relative" bind:this={container} bind:clientHeight={viewportH} on:scroll={(e) => (scrollTop = scrollTopOf(e))} style={`font-size:${Math.round(14 * gridZoom / 100)}px`}>
    {#if tab}
      {@const effCols = Math.min(tab.cols, 40)}
      <div style={`width:${64 + effCols * COL_W}px; position:relative`}>
        <div class="sticky top-0 z-20 flex bg-gray-50 dark:bg-[#2d2d2d] border-b border-gray-300 dark:border-gray-600" style={`height:${HEAD_H}px`}>
          <div class="sticky left-0 z-30 bg-gray-50 dark:bg-[#2d2d2d] border-r border-gray-300 dark:border-gray-600" style={`width:64px;height:${HEAD_H}px`} />
          {#each headerCols.slice(0, effCols) as c (c)}
            <div
              class="shrink-0 grid place-items-center text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700
                {selCol === c ? 'bg-blue-100 dark:bg-blue-900/50 text-docs' : ''}
                {tab.frozenCols === 1 && c === 0 ? 'border-r-2 border-r-blue-400' : ''}"
              style={`width:${COL_W}px;height:${HEAD_H}px`}
              on:click={() => { selCol = c; }}
            >
              {colToName(c)}
              {#if tab.filterCol === c}
                <span class="text-[9px] text-docs ml-0.5">▼</span>
              {/if}
            </div>
          {/each}
        </div>

        <div style={`height:${tab.rows * ROW_H}px; position:relative`}>
          <div style={`position:absolute; top:${startRow * ROW_H}px`}>
            {#each visibleRows as r (r)}
              {#if !filteredRows || filteredRows(r)}
                <div class="flex" style={`height:${ROW_H}px`}>
                  <div
                    class="sticky left-0 z-10 shrink-0 grid place-items-center text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#2d2d2d] border-r border-b border-gray-200 dark:border-gray-700
                      {selRow === r ? 'bg-blue-100 dark:bg-blue-900/50 text-docs' : ''}
                      {tab.frozenRows === 1 && r === 0 ? 'border-b-2 border-b-blue-400' : ''}"
                    style={`width:64px;height:${ROW_H}px`}
                    on:click={() => { selRow = r; }}
                  >
                    {r + 1}
                  </div>
                  {#each headerCols.slice(0, effCols) as c (c)}
                    {@const key = cellKey(r, c)}
                    {@const isAnchor = editing && editingInGrid && r === editAnchorRow && c === editAnchorCol}
                    {@const inPicked = pickedBox ? r >= pickedBox.r0 && r <= pickedBox.r1 && c >= pickedBox.c0 && c <= pickedBox.c1 : false}
                    {@const meta = metaOf(key)}
                    <div
                      class="shrink-0 border-r border-b border-gray-200 dark:border-gray-700 px-1.5 flex items-center overflow-hidden text-sm cursor-cell
                        {selRow === r && selCol === c ? 'outline outline-2 -outline-offset-2 outline-docs' : ''}
                        {inPicked ? 'bg-blue-100/70 dark:bg-blue-900/40' : ''}"
                      style={`width:${COL_W}px;height:${ROW_H}px;${cellStyle(key)}`}
                      on:click={(e) => onCellClick(r, c, e)}
                      on:dblclick={() => { selRow = r; selCol = c; startEdit(); }}
                      title={meta.note ?? ""}
                    >
                      {#if isAnchor && !formulaMode}
                        <input bind:this={cellEditInput} class="w-full h-full outline-none bg-white dark:bg-[#1f1f1f] text-sm" bind:value={editValue} on:input={() => onFormulaInput()} on:keydown={onEditKeydown} on:blur={() => stopEdit(true)} />
                      {:else if meta.checkbox}
                        <input type="checkbox" checked={display[key] === "true" || display[key] === "TRUE"} on:change={(e) => setCellValue(key, checkboxVal(e) ? "true" : "false")} />
                      {:else if meta.dropdown?.length}
                        <select class="w-full h-full bg-transparent outline-none text-sm" value={display[key] ?? ""} on:change={(e) => setCellValue(key, selectOpt(e))}>
                          <option value="" />
                          {#each meta.dropdown as opt (opt)}<option value={opt}>{opt}</option>{/each}
                        </select>
                      {:else}
                        <span class="truncate">{display[key] ?? ""}</span>
                        {#if meta.note}<span class="absolute top-0 right-0 text-[8px] text-amber-500">▮</span>{/if}
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- Selection range outline (drag / shift-click) -->
    {#if tab && selRange && (selRange.r1 > selRange.r0 || selRange.c1 > selRange.c0)}
      <div
        class="absolute pointer-events-none border-2 border-docs bg-blue-500/5 rounded-sm z-10"
        style={`left:${64 + selRange.c0 * COL_W}px; top:${selRange.r0 * ROW_H}px; width:${(selRange.c1 - selRange.c0 + 1) * COL_W}px; height:${(selRange.r1 - selRange.r0 + 1) * ROW_H}px`}
      />
    {/if}

    <!-- Floating charts -->
    {#if tab}
      {#each tab.charts ?? [] as ch (ch.id)}
        {@const cd = chartData(ch.range)}
        <div
          class="absolute z-30 card !p-2 shadow-modal cursor-move group"
          style={`left:${64 + ch.anchor.col * COL_W}px; top:${HEAD_H + ch.anchor.row * ROW_H}px; width:${ch.w ?? 340}px; height:${ch.h ?? 240}px;`}
          on:mousedown={(e) => startChartDrag(e, ch)}
          title="Drag to move"
        >
          <button
            class="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-gray-700 text-white text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove chart"
            on:mousedown|stopPropagation
            on:click|stopPropagation={() => removeChart(ch.id)}
          >✕</button>
          <SheetChartView kind={ch.kind} labels={cd.labels} series={cd.series} title={ch.title} w={ch.w ?? 340} h={ch.h ?? 240} />
        </div>
      {/each}
    {/if}
  </div>

  <!-- Floating formula editor for cell edits -->
  {#if editing && editingInGrid && formulaMode && tab}
    <div class="absolute z-40 pointer-events-none" style={`left:${64 + editAnchorCol * COL_W}px; top:${HEAD_H + editAnchorRow * ROW_H - 1}px;`}>
      <input
        bind:this={gridFormulaInput}
        class="pointer-events-auto outline-none bg-white dark:bg-[#1f1f1f] text-sm font-mono px-1.5 border-2 border-docs shadow-card"
        style={`width:${Math.max(COL_W * 2, COL_W + 90)}px; height:${ROW_H + 2}px;`}
        bind:value={editValue}
        on:input={() => onFormulaInput()}
        on:keydown={onEditKeydown}
        on:blur={() => stopEdit(true)}
      />
    </div>
  {/if}

  <!-- Sheet tabs -->
  {#if data}
    <div class="h-9 shrink-0 flex items-center gap-1 px-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252525] overflow-x-auto">
      {#each data.sheets as s, i (i)}
        {#if !s.hidden}
          <button
            class="btn btn-ghost !h-7 text-sm shrink-0 {data.activeSheet === i ? 'bg-white dark:bg-gray-700 shadow-card' : ''}"
            on:dblclick={() => renameSheet(i)}
            on:click={() => selectSheet(i)}
            on:contextmenu|preventDefault={() => {}}
            title="Double-click to rename"
          >
            {s.name}
          </button>
        {/if}
      {/each}
      <button class="btn btn-ghost !px-2 shrink-0" title="Add sheet" on:click={addSheet}>＋</button>
      <span class="flex-1" />
      <select class="input !h-6 !text-xs shrink-0" on:change={sheetAction}>
        <option value="" disabled selected>Sheet ⚙</option>
        <option value="dup">⧉ Duplicate sheet</option>
        <option value="hide">👁 Hide sheet</option>
        <option value="show">👁 Show hidden sheets</option>
        <option value="del">🗑 Delete sheet</option>
      </select>
    </div>
  {/if}

  <!-- Dialogs -->
  {#if dialog && dialog !== "chart"}
    <div class="fixed inset-0 z-[70] bg-black/40 grid place-items-center" on:click|self={() => (dialog = null)}>
      <div class="card w-[440px] max-w-[92vw] p-5 shadow-modal" on:click|stopPropagation>
        {#if dialog === "find"}
          <h3 class="font-medium mb-3">Find and replace</h3>
          <input class="input w-full mb-2" placeholder="Find" bind:value={findText} on:keydown={(e) => e.key === "Enter" && findNextCell()} />
          <input class="input w-full mb-3" placeholder="Replace with" bind:value={replaceText} />
          <div class="flex gap-2">
            <button class="btn btn-ghost text-xs" on:click={findNextCell}>Find next</button>
            <button class="btn btn-primary text-xs flex-1" on:click={replaceAllCells}>Replace all</button>
          </div>
        {:else if dialog === "dropdown"}
          <h3 class="font-medium mb-3">Dropdown options</h3>
          <p class="text-xs text-gray-500 mb-2">Comma-separated values for cell {selKey}:</p>
          <input class="input w-full mb-3" placeholder="Not started, In progress, Done" bind:value={ddOptions} />
          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost text-xs" on:click={() => { patchMeta({ dropdown: undefined }); dialog = null; }}>Remove</button>
            <button class="btn btn-primary text-xs" on:click={() => { patchMeta({ dropdown: ddOptions.split(",").map((s) => s.trim()).filter(Boolean) }); dialog = null; }}>Apply</button>
          </div>
        {:else if dialog === "note"}
          <h3 class="font-medium mb-3">Note for {selKey}</h3>
          <textarea class="input w-full !h-24 mb-3" bind:value={noteText} placeholder="Sticky note text…" />
          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost text-xs" on:click={() => { patchMeta({ note: undefined }); dialog = null; }}>Remove</button>
            <button class="btn btn-primary text-xs" on:click={() => { patchMeta({ note: noteText }); dialog = null; }}>Save</button>
          </div>
        {:else if dialog === "stats" && statsCol}
          <h3 class="font-medium mb-3">Column {statsCol.col} stats</h3>
          <div class="space-y-1 text-sm">
            <p>Count: <b>{statsCol.count}</b></p>
            <p>Sum: <b>{statsCol.sum}</b></p>
            <p>Average: <b>{Math.round(statsCol.avg * 1000) / 1000}</b></p>
            <p>Min: <b>{statsCol.min}</b></p>
            <p>Max: <b>{statsCol.max}</b></p>
          </div>
        {:else if dialog === "validate"}
          <h3 class="font-medium mb-3">Data validation</h3>
          <p class="text-xs text-gray-500 mb-2">Restrict cell {selKey} to a dropdown list (same as Insert → Dropdown):</p>
          <input class="input w-full mb-3" placeholder="Yes, No, Maybe" bind:value={ddOptions} />
          <button class="btn btn-primary text-xs" on:click={() => { patchMeta({ dropdown: ddOptions.split(",").map((s) => s.trim()).filter(Boolean) }); dialog = null; }}>Apply</button>
        {:else if dialog === "emoji"}
          <h3 class="font-medium mb-3">Insert into {selKey}</h3>
          <div class="grid grid-cols-10 gap-1">
            {#each EMOJIS as e (e)}
              <button class="text-lg p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" on:click={() => { editValue = e; commit(); dialog = null; }}>{e}</button>
            {/each}
          </div>
        {:else if dialog === "named"}
          <h3 class="font-medium mb-3">Named ranges</h3>
          {#if Object.keys(data?.names ?? {}).length}
            <div class="space-y-1 mb-3 max-h-40 overflow-y-auto">
              {#each Object.entries(data?.names ?? {}) as [n, ref] (n)}
                <div class="flex items-center gap-2 text-sm">
                  <span class="font-mono font-semibold">{n}</span>
                  <span class="font-mono text-xs text-gray-500 flex-1">{ref}</span>
                  <button class="btn btn-ghost !h-6 !px-1.5 text-xs" title="Remove {n}" on:click={() => removeNamedRange(n)}>✕</button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-gray-500 mb-3">No named ranges yet. Use them in formulas like <code class="font-mono">=SUM(Sales)</code>.</p>
          {/if}
          <div class="grid grid-cols-2 gap-2 mb-3">
            <input class="input w-full font-mono" placeholder="NAME" bind:value={newName} />
            <input class="input w-full font-mono" placeholder="A1:B5" bind:value={newRange} />
          </div>
          <button class="btn btn-primary text-xs w-full" on:click={addNamedRange}>Add named range</button>
        {:else if dialog === "shortcuts"}
          <h3 class="font-medium mb-3">Keyboard shortcuts</h3>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm max-h-[50vh] overflow-y-auto">
            {#each [["⌘C/⌘V","Copy / paste"],["⌘D","Fill down"],["⌘R","Fill right"],["⌘F","Find & replace"],["⌘Z/⌘Y","Undo / redo"],["⌘S","Save"],["⌘P","Print"],["⌘K","Command palette"],["F2","Edit cell"],["Arrows in formula","Pick cells"],["⇧+Arrows","Extend range"]] as [k, v] (k)}
              <span class="text-gray-500">{v}</span><span class="font-mono">{k}</span>
            {/each}
          </div>
        {:else if dialog === "fnlist"}
          <h3 class="font-medium mb-3">Function list</h3>
          <div class="max-h-[55vh] overflow-y-auto space-y-2">
            {#each suggestFunctions("") as f (f.name)}
              <div class="text-sm"><b class="font-mono">{f.name}</b> <span class="text-xs text-gray-500">{f.signature}</span><br /><span class="text-xs text-gray-400">{f.description}</span></div>
            {/each}
          </div>
        {:else if dialog === "details" && file}
          <h3 class="font-medium mb-3">Details</h3>
          <div class="space-y-1.5 text-sm">
            <p>Name: <b>{file.name}</b></p>
            <p>Sheets: <b>{data?.sheets.length}</b></p>
            <p>Cells used: <b>{tab ? Object.keys(tab.cells).length : 0}</b></p>
            <p>Modified: <b>{new Date(file.updatedAt).toLocaleString()}</b></p>
          </div>
        {:else if dialog === "protect"}
          <h3 class="font-medium mb-3">Protect sheet</h3>
          <p class="text-xs text-gray-500 mb-3">Local-first protection: sheet data lives only on this machine. Show a warning banner when editing?</p>
          <button class="btn btn-primary text-xs" on:click={() => { toast("Protection banner enabled for this session."); dialog = null; }}>Enable</button>
        {/if}
        <div class="flex justify-end mt-4">
          <button class="btn btn-primary" on:click={() => (dialog = null)}>Done</button>
        </div>
      </div>
    </div>
  {/if}

  {#if sheetAsk}
    <div class="fixed inset-0 z-[90] bg-black/40 grid place-items-center" on:click|self={askCancel}>
      <div class="card w-[380px] max-w-[92vw] p-5 shadow-modal" on:click|stopPropagation>
        <h3 class="font-medium mb-3">{sheetAsk.title}</h3>
        {#if sheetAsk.kind === "prompt"}
          <input
            bind:this={askInput}
            class="input w-full mb-4"
            placeholder={sheetAsk.placeholder}
            bind:value={sheetAsk.value}
            on:keydown={(e) => { if (e.key === "Enter") askOk(); if (e.key === "Escape") askCancel(); }}
          />
        {/if}
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost text-xs" on:click={askCancel}>Cancel</button>
          <button class="btn btn-primary text-xs" on:click={askOk}>{sheetAsk.kind === "prompt" ? "OK" : "Delete"}</button>
        </div>
      </div>
    </div>
  {/if}

  {#if toasts.length}
    <div class="fixed bottom-12 left-1/2 -translate-x-1/2 z-[95] flex flex-col gap-2 items-center">
      {#each toasts as t (t.id)}
        <div class="card !py-2 !px-4 text-sm shadow-modal bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">{t.msg}</div>
      {/each}
    </div>
  {/if}

  {#if dialog === "chart"}
    <ChartModal
      initialRange={chartDraft}
      getData={(rangeText) => {
        const p = parseRangeText(rangeText);
        return p ? chartData(p) : { labels: [], series: [] };
      }}
      on:create={(e) => addChart(e.detail.kind, e.detail.range, e.detail.title)}
      on:close={() => (dialog = null)}
    />
  {/if}

  {#if transfer}
    <TransferModal
      mode={transfer}
      options={transfer === "import" ? SHEET_IMPORT_OPTS : SHEET_EXPORT_OPTS}
      accent="#0f9d58"
      on:pick={(e) => (transfer === "import" ? void doSheetImport(e.detail) : void doSheetExport(e.detail))}
      on:close={() => (transfer = null)}
    />
  {/if}
</div>

<style>
  div[role="grid"] span {
    font-variant-numeric: tabular-nums;
  }
</style>
