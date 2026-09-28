// Spreadsheet formula engine.
// Supports: numbers, strings, cell refs (A1), ranges (A1:B3), arithmetic
// (+ - * / % ^), comparisons, functions (SUM, AVERAGE, COUNT, IF, MIN, MAX,
// ROUND, ABS, SQRT) and error propagation.

import type { SheetTab } from "../types";

export type CellValue = number | string | boolean | null;
export type Grid = Record<string, string>; // "A1" -> raw input

export const ERROR = "#ERROR!";

interface Token {
  type: "num" | "str" | "ref" | "range" | "func" | "op" | "lp" | "rp" | "comma";
  value: string;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let n = "";
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      tokens.push({ type: "num", value: n });
      continue;
    }
    if (c === '"') {
      let s = "";
      i++;
      while (i < src.length && src[i] !== '"') s += src[i++];
      i++; // closing quote
      tokens.push({ type: "str", value: s });
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let id = "";
      while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) id += src[i++];
      const cleanId = id.replace(/\$/g, "").toUpperCase();
      // range like A1:B3 — tolerate whitespace and $ anchors around the colon
      let j = i;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === ":" && /[A-Za-z$]/.test(src[j + 1] ?? "")) {
        j++; // colon
        while (j < src.length && /\s/.test(src[j])) j++;
        let ref2 = "";
        while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) ref2 += src[j++];
        i = j;
        tokens.push({ type: "range", value: `${cleanId}:${ref2.replace(/\$/g, "").toUpperCase()}` });
      } else if (/^[A-Z]+[0-9]+$/.test(cleanId) && src[j] === ":") {
        // "A1 : A3" — the second half was tokenized separately; skip ahead and
        // consume the other ref so this becomes one range token.
        j++; // colon
        while (j < src.length && /\s/.test(src[j])) j++;
        let ref2 = "";
        while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) ref2 += src[j++];
        if (ref2) {
          i = j;
          tokens.push({ type: "range", value: `${cleanId}:${ref2.replace(/\$/g, "").toUpperCase()}` });
        } else {
          tokens.push({ type: "ref", value: cleanId });
        }
      } else if (src[j] === "(") {
        i = j;
        tokens.push({ type: "func", value: cleanId });
      } else {
        tokens.push({ type: "ref", value: cleanId });
      }
      continue;
    }
    if ("+-*/%^&<>=".includes(c)) {
      if ((c === "<" || c === ">") && src[i + 1] === "=") {
        tokens.push({ type: "op", value: c + "=" });
        i += 2;
        continue;
      }
      if (c === "<" && src[i + 1] === ">") {
        tokens.push({ type: "op", value: "<>" });
        i += 2;
        continue;
      }
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "(") { tokens.push({ type: "lp", value: c }); i++; continue; }
    if (c === ")") { tokens.push({ type: "rp", value: c }); i++; continue; }
    if (c === ",") { tokens.push({ type: "comma", value: c }); i++; continue; }
    throw new Error(`Unexpected character ${c}`);
  }
  return tokens;
}

// ── Cell helpers ────────────────────────────────────────────────

export function colToName(col: number): string {
  let s = "";
  let c = col;
  while (c >= 0) {
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26) - 1;
  }
  return s;
}

export function nameToCol(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function cellKey(row: number, col: number): string {
  return `${colToName(col)}${row + 1}`;
}

/** Parse a reference like "B7" into 0-based {row, col}. */
function parseRef(ref: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)([0-9]+)$/.exec(ref.replace(/\$/g, "").toUpperCase());
  if (!m) return null;
  return { col: nameToCol(m[1]), row: parseInt(m[2], 10) - 1 };
}

/** Expand every reference/range in a raw formula into concrete cell keys. */
export function referencedCells(raw: string): string[] {
  const keys: string[] = [];
  const re = /([A-Za-z]+[0-9]+)\s*:\s*([A-Za-z]+[0-9]+)|([A-Za-z]+[0-9]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m[1] && m[2]) {
      const a = parseRef(m[1].toUpperCase());
      const b = parseRef(m[2].toUpperCase());
      if (!a || !b) continue;
      for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++)
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++)
          keys.push(cellKey(r, c));
    } else if (m[3]) {
      keys.push(m[3].toUpperCase());
    }
  }
  return keys;
}

// ── Evaluation ──────────────────────────────────────────────────

interface EvalCtx {
  tab: SheetTab;
  cache: Map<string, CellValue>;
  visiting: Set<string>;
}

/** The computed value behind a cell: numbers, strings, booleans or errors. */
export function evaluateCell(tab: SheetTab, key: string): CellValue {
  const ctx: EvalCtx = { tab, cache: new Map(), visiting: new Set() };
  return evalKey(key.toUpperCase(), ctx);
}

function evalKey(key: string, ctx: EvalCtx): CellValue {
  if (ctx.cache.has(key)) return ctx.cache.get(key)!;
  if (ctx.visiting.has(key)) return ERROR; // circular reference
  const raw = ctx.tab.cells[key];
  if (raw === undefined || raw === "") return null;
  ctx.visiting.add(key);
  let out: CellValue;
  try {
    out = raw.startsWith("=") ? evalFormula(raw.slice(1), ctx) : literal(raw);
  } catch {
    out = ERROR;
  }
  ctx.visiting.delete(key);
  ctx.cache.set(key, out);
  return out;
}

function literal(raw: string): CellValue {
  const t = raw.trim();
  if (t === "") return null;
  if (/^-?[0-9]+(\.[0-9]+)?%$/.test(t)) return parseFloat(t) / 100;
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(t)) return parseFloat(t);
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
  return t;
}

function evalFormula(src: string, ctx: EvalCtx): CellValue {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  // Precedence climbing: compare < concat < add < mul < power < unary < primary
  function parseCompare(): CellValue {
    let left = parseAdd();
    while (peek()?.type === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(peek().value)) {
      const op = eat().value;
      const right = parseAdd();
      left = compare(left, op, right);
    }
    return left;
  }

  function parseAdd(): CellValue {
    let left = parseMul();
    while (peek()?.type === "op" && ["+", "-", "&"].includes(peek().value)) {
      const op = eat().value;
      const right = parseMul();
      left = op === "&" ? textValue(left) + textValue(right) : arith(left, op, right);
    }
    return left;
  }

  function parseMul(): CellValue {
    let left = parsePow();
    while (peek()?.type === "op" && ["*", "/", "%"].includes(peek().value)) {
      const op = eat().value;
      const right = parsePow();
      left = arith(left, op, right);
    }
    return left;
  }

  function parsePow(): CellValue {
    let base = parseUnary();
    if (peek()?.type === "op" && peek().value === "^") {
      eat();
      const exp = parsePow();
      const b = num(base), e = num(exp);
      if (b === null || e === null) return ERROR;
      base = Math.pow(b, e);
    }
    // Postfix percent: 50% -> 0.5, A1% -> A1/100
    while (peek()?.type === "op" && peek().value === "%") {
      eat();
      const n = num(base);
      base = n === null ? ERROR : n / 100;
    }
    return base;
  }

  function parseUnary(): CellValue {
    if (peek()?.type === "op" && peek().value === "-") {
      eat();
      const v = parseUnary();
      const n = num(v);
      return n === null ? ERROR : -n;
    }
    if (peek()?.type === "op" && peek().value === "+") {
      eat();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): CellValue {
    const t = peek();
    if (!t) throw new Error("Unexpected end of formula");
    if (t.type === "num") { eat(); return parseFloat(t.value); }
    if (t.type === "str") { eat(); return t.value; }
    if (t.type === "lp") {
      eat();
      const v = parseCompare();
      if (peek()?.type !== "rp") throw new Error("Expected )");
      eat();
      return v;
    }
    if (t.type === "ref") {
      eat();
      if (t.value === "TRUE") return true;
      if (t.value === "FALSE") return false;
      if (!/^[A-Z]+[0-9]+$/.test(t.value)) return "#NAME?";
      return evalKey(t.value, ctx);
    }
    if (t.type === "range") {
      eat();
      return rangeValues(t.value, ctx);
    }
    if (t.type === "func") {
      eat();
      if (peek()?.type !== "lp") throw new Error("Expected (");
      eat();
      const args: CellValue[] = [];
      if (peek()?.type !== "rp") {
        args.push(parseCompare());
        while (peek()?.type === "comma") {
          eat();
          args.push(parseCompare());
        }
      }
      if (peek()?.type !== "rp") throw new Error("Expected )");
      eat();
      return callFn(t.value, args, ctx);
    }
    throw new Error(`Unexpected token ${t.value}`);
  }

  const out = parseCompare();
  if (pos !== tokens.length) throw new Error("Trailing tokens");
  return out;
}

function rangeValues(spec: string, ctx: EvalCtx): CellValue {
  const [a, b] = spec.split(":");
  const pa = parseRef(a), pb = parseRef(b);
  if (!pa || !pb) return ERROR;
  const vals: CellValue[] = [];
  for (let r = Math.min(pa.row, pb.row); r <= Math.max(pa.row, pb.row); r++)
    for (let c = Math.min(pa.col, pb.col); c <= Math.max(pa.col, pb.col); c++)
      vals.push(evalKey(cellKey(r, c), ctx));
  return { __range: true, vals } as unknown as CellValue;
}

function flatten(args: CellValue[]): { nums: number[]; strings: string[] } {
  const { nums, strings } = flattenAll(args);
  return { nums, strings };
}

function flattenAll(args: CellValue[]): { nums: number[]; strings: string[]; all: CellValue[] } {
  const nums: number[] = [];
  const strings: string[] = [];
  const all: CellValue[] = [];
  for (const a of args) {
    const r = a as unknown as { __range?: boolean; vals?: CellValue[] };
    if (r && r.__range && Array.isArray(r.vals)) {
      for (const v of r.vals) push(v);
    } else push(a);
  }
  function push(v: CellValue): void {
    all.push(v);
    if (typeof v === "number") nums.push(v);
    else if (typeof v === "string" && v !== ERROR) strings.push(v);
    else if (typeof v === "boolean") nums.push(v ? 1 : 0);
  }
  return { nums, strings, all };
}

/** Criteria like ">5", "<=10", "=text", "text" or plain value. */
function matchesCriteria(v: CellValue, criteria: CellValue): boolean {
  const c = String(criteria ?? "").trim();
  const m = /^(>=|<=|<>|>|<|=)?\s*(.+)$/.exec(c);
  if (!m) return String(v) === c;
  const op = m[1] ?? "=";
  const rhsRaw = m[2];
  const rhsNum = parseFloat(rhsRaw);
  const bothNumeric = !Number.isNaN(rhsNum) && typeof v === "number";
  let cmp: number;
  if (bothNumeric) cmp = (v as number) - rhsNum;
  else {
    const a = String(v ?? "").toLowerCase();
    const b = rhsRaw.toLowerCase();
    cmp = a < b ? -1 : a > b ? 1 : 0;
  }
  switch (op) {
    case ">": return cmp > 0;
    case "<": return cmp < 0;
    case ">=": return cmp >= 0;
    case "<=": return cmp <= 0;
    case "<>": return cmp !== 0;
    default: return cmp === 0;
  }
}

function num(v: CellValue): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Render any value as text for concatenation / text functions. */
function textValue(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return displayValue(v);
}

/** First scalar behind an argument (ranges collapse to their first value). */
function scalar(args: CellValue[], i: number): CellValue {
  const v = args[i];
  const r = v as unknown as { __range?: boolean; vals?: CellValue[] };
  if (r && r.__range && Array.isArray(r.vals)) return r.vals[0] ?? null;
  return v ?? null;
}

function arith(a: CellValue, op: string, b: CellValue): CellValue {
  if (op === "+") {
    const x = num(a), y = num(b);
    if (x !== null && y !== null) return x + y;
    return String(a ?? "") + String(b ?? "");
  }
  const x = num(a), y = num(b);
  if (x === null || y === null) return ERROR;
  switch (op) {
    case "-": return x - y;
    case "*": return x * y;
    case "/": return y === 0 ? "#DIV/0!" : x / y;
    case "%": return y === 0 ? "#DIV/0!" : x % y;
  }
  return ERROR;
}

function compare(a: CellValue, op: string, b: CellValue): CellValue {
  let cmp: number;
  const na = num(a), nb = num(b);
  if (na !== null && nb !== null) cmp = na - nb;
  else {
    const sa = String(a ?? "").toLowerCase();
    const sb = String(b ?? "").toLowerCase();
    cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  switch (op) {
    case "=": return cmp === 0;
    case "<>": return cmp !== 0;
    case "<": return cmp < 0;
    case ">": return cmp > 0;
    case "<=": return cmp <= 0;
    case ">=": return cmp >= 0;
  }
  return ERROR;
}

function callFn(name: string, args: CellValue[], ctx: EvalCtx): CellValue {
  const { nums, strings, all } = flattenAll(args);
  switch (name) {
    case "SUM":
      return nums.reduce((a, b) => a + b, 0);
    case "AVERAGE":
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : "#DIV/0!";
    case "COUNT":
      return nums.length;
    case "COUNTA":
      return nums.length + strings.length;
    case "MIN":
      return nums.length ? Math.min(...nums) : 0;
    case "MAX":
      return nums.length ? Math.max(...nums) : 0;
    case "PRODUCT":
      return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
    case "MEDIAN": {
      if (!nums.length) return 0;
      const s = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }
    case "STDEV": {
      if (nums.length < 2) return ERROR;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1);
      return Math.sqrt(variance);
    }
    case "COUNTIF": {
      const vals = args[0] as unknown as { __range?: boolean; vals?: CellValue[] };
      const list = vals && vals.__range && vals.vals ? vals.vals : [args[0]];
      const criteria = args[1];
      return list.filter((v) => matchesCriteria(v, criteria)).length;
    }
    case "SUMIF": {
      const vals = args[0] as unknown as { __range?: boolean; vals?: CellValue[] };
      const list = vals && vals.__range && vals.vals ? vals.vals : [args[0]];
      const criteria = args[1];
      let acc = 0;
      list.forEach((v, i) => {
        if (matchesCriteria(v, criteria)) {
          const target = args[2] !== undefined
            ? (args[2] as unknown as { __range?: boolean; vals?: CellValue[] }).vals?.[i]
            : v;
          const n = num(target ?? null);
          if (n !== null) acc += n;
        }
      });
      return acc;
    }
    case "AND": {
      const vals = all.filter((v) => v !== null && v !== "");
      if (!vals.length) return false;
      return vals.every((v) => (typeof v === "boolean" ? v : (num(v) ?? 0) !== 0));
    }
    case "OR": {
      const vals = all.filter((v) => v !== null && v !== "");
      if (!vals.length) return false;
      return vals.some((v) => (typeof v === "boolean" ? v : (num(v) ?? 0) !== 0));
    }
    case "NOT":
      return !((num(scalar(args, 0)) ?? 0) !== 0);
    case "LEN":
      return textValue(scalar(args, 0)).length;
    case "UPPER":
      return textValue(scalar(args, 0)).toUpperCase();
    case "LOWER":
      return textValue(scalar(args, 0)).toLowerCase();
    case "TRIM":
      return textValue(scalar(args, 0)).trim();
    case "LEFT": {
      const s = textValue(scalar(args, 0));
      const n = num(scalar(args, 1)) ?? 1;
      return s.slice(0, Math.max(0, n));
    }
    case "RIGHT": {
      const s = textValue(scalar(args, 0));
      const n = num(scalar(args, 1)) ?? 1;
      return n <= 0 ? "" : s.slice(-n);
    }
    case "MID": {
      const s = textValue(scalar(args, 0));
      const start = (num(scalar(args, 1)) ?? 1) - 1;
      const len = num(scalar(args, 2)) ?? 0;
      return s.slice(start, start + len);
    }
    case "ROUND": {
      const v = num(args[0]) ?? 0;
      const d = num(args[1]) ?? 0;
      const f = Math.pow(10, d);
      return Math.round(v * f) / f;
    }
    case "ABS": {
      const v = num(args[0]);
      return v === null ? ERROR : Math.abs(v);
    }
    case "SQRT": {
      const v = num(args[0]);
      if (v === null || v < 0) return ERROR;
      return Math.sqrt(v);
    }
    case "IF": {
      const cond = scalar(args, 0);
      const truthy = typeof cond === "boolean" ? cond : (num(cond) ?? 0) !== 0;
      return truthy ? scalar(args, 1) ?? true : scalar(args, 2) ?? false;
    }
    case "IFERROR":
      return args[0] === ERROR || args[0] === "#DIV/0!" ? args[1] ?? "" : args[0];
    case "CONCAT":
    case "CONCATENATE": {
      void ctx;
      return all.map((v) => textValue(v)).join("");
    }
    case "NOW":
      return new Date().toLocaleString();
    default:
      return `#NAME?`;
  }
}

/** Format a computed value for display. */
export function displayValue(v: CellValue): string {
  if (v === null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return ERROR;
    // Trim floating point noise: 0.30000000000000004 -> 0.3
    return String(Math.round(v * 1e10) / 1e10);
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return v;
}
