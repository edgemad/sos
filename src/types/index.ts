// Domain types for every SOS module.

export type ModuleId =
  | "home"
  | "writer"
  | "sheets"
  | "slides"
  | "forms"
  | "notes"
  | "calendar"
  | "arcade";

export type DocKind = "document" | "spreadsheet" | "deck" | "form" | "note";

export interface SosFileMeta {
  id: string;
  kind: DocKind;
  name: string;
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  trashed: boolean;
  color?: string;
}

export interface SosFile<T> extends SosFileMeta {
  content: T;
}

// ── Writer ──────────────────────────────────────────────────────

/** One page-like sub-document inside a Docs file (Google Docs "tabs"). */
export interface WriterTab {
  id: string;
  name: string;
  html: string;
}

/** Page + editor settings stored per document. */
export interface WriterSettings {
  orientation: "portrait" | "landscape";
  pageless: boolean;
  columns: 1 | 2 | 3;
  zoom: number; // percent, 50–200
  header: string;
  footer: string;
  showHeader: boolean;
  showFooter: boolean;
  pageNumbers: "none" | "bottom" | "top";
  textDirection: "ltr" | "rtl";
}

export interface WriterDoc {
  html: string; // rich text of the active tab (legacy single-tab compat)
  words: number;
  tabs?: WriterTab[]; // multi-tab documents
  activeTabId?: string;
  settings?: Partial<WriterSettings>;
}

// ── Sheets ──────────────────────────────────────────────────────

/** Per-cell display/format metadata (in addition to the raw input). */
export interface CellMeta {
  /** number format: auto | number | currency | percent | round0 | round2 */
  fmt?: "auto" | "number" | "currency" | "percent" | "round0" | "round2";
  /** sticky note text */
  note?: string;
  /** dropdown options (cell renders a select-style chip) */
  dropdown?: string[];
  /** checkbox cell */
  checkbox?: boolean;
  b?: boolean;
  i?: boolean;
  color?: string;
  bg?: string;
  /** horizontal cell alignment (OnlyOffice-style) */
  align?: "left" | "center" | "right";
}

export interface SheetData {
  sheets: SheetTab[];
  activeSheet: number;
  /** Named ranges: NAME -> "Sheet1!A1:B5" (sheet optional = active sheet). */
  names?: Record<string, string>;
}

/** A chart rendered as an overlay on the grid, computed from a cell range. */
export interface SheetChart {
  id: string;
  kind: "bar" | "line" | "pie";
  /** Source range (inclusive, 0-based). */
  range: { r0: number; r1: number; c0: number; c1: number };
  title: string;
  /** Top-left anchor cell of the floating chart card. */
  anchor: { row: number; col: number };
  /** Card size in px (defaults 320×230). */
  w?: number;
  h?: number;
}

export interface SheetTab {
  name: string;
  rows: number;
  cols: number;
  cells: Record<string, string>; // "A1" -> raw input (value or formula)
  meta?: Record<string, CellMeta>; // per-cell formats, notes, dropdowns…
  frozenRows?: number;
  frozenCols?: number;
  hidden?: boolean;
  filterCol?: number | null; // simple column filter text
  filterText?: string;
  /** Charts attached to this tab. */
  charts?: SheetChart[];
}

// ── Slides ──────────────────────────────────────────────────────

export interface Deck {
  slides: Slide[];
  theme?: DeckTheme;        // deck-wide color scheme
  transition?: TransitionKind; // deck-wide default
  showSlideNumbers?: boolean;
}

export type DeckTheme = "simple" | "bold" | "sleek" | "forest" | "sunset";

export type TransitionKind = "none" | "fade" | "slide" | "zoom" | "flip";

export type SlideBlockType = "text" | "title" | "shape" | "code" | "image" | "line";

export type SlideLayout = "title" | "titleBody" | "section" | "twoColumn" | "blank";

export interface SlideBlock {
  id: string;
  type: SlideBlockType;
  x: number; // percentages of the 16:9 canvas
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontSize: number;
  align: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  link?: string;          // hyperlink
  rotation?: number;      // degrees
  flipX?: boolean;
  flipY?: boolean;
}

export interface Slide {
  id: string;
  background: string;
  blocks: SlideBlock[];
  notes: string;
  layout?: SlideLayout;
  skipped?: boolean;      // hidden from presentation but kept in editor
  transition?: TransitionKind;
}

// ── Forms ───────────────────────────────────────────────────────

export interface FormDoc {
  title: string;
  description: string;
  questions: FormQuestion[];
}

export type FormQuestionType = "short" | "long" | "choice" | "checkbox" | "scale";

export interface FormQuestion {
  id: string;
  type: FormQuestionType;
  prompt: string;
  required: boolean;
  options: string[];
}

export interface FormResponse {
  submittedAt: number;
  answers: Record<string, string | string[] | number>;
}

// ── Notes ────────────────────────────────────────────────────────

export interface Note {
  id: string;
  text: string;
  color: string;
  pinned: boolean;
  updatedAt: number;
  checklist: { id: string; text: string; done: boolean }[];
}

// ── Calendar ────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  date: string; // yyyy-mm-dd
  title: string;
  time: string; // HH:mm
  color: string;
}

// ── App-wide persisted state ────────────────────────────────────

export interface SosState {
  version: number;
  files: Record<string, SosFile<unknown>>;
  notes: Note[];
  events: CalendarEvent[];
  recent: string[]; // file ids, most recent first
}
