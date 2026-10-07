// Talia's chat brain: the Jarvis-style conversational core.
//
// Two engines, one interface:
//  - "ollama": a self-hosted LLM (any Ollama-compatible /api/chat endpoint the
//    user points at — 100% local, nothing leaves the machine).
//  - "local": a tiny offline personality brain built in, so Talia always
//    answers even with no model configured or the endpoint unreachable.
//
// Attachments of ANY type are supported: images become data URLs (shown in
// chat and passed to vision models), text-ish files get a preview extracted,
// everything else travels as a recognized chip. Pure helpers are exported for
// unit tests.

import { isImageFile, MAX_EMBEDDED_IMAGE_EDGE } from "./attachments";

// ── Types ───────────────────────────────────────────────────────────────

export type AttachmentKind = "image" | "text" | "other";

export interface TaliaAttachment {
  name: string;
  kind: AttachmentKind;
  /** Data URL for images (chat preview + vision models). */
  dataUrl?: string;
  /** Extracted preview for text-ish files. */
  textPreview?: string;
  /** True when the preview was cut short. */
  truncated?: boolean;
  size?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "talia";
  text: string;
  ts: number;
  attachments?: TaliaAttachment[];
  /** Which brain produced a Talia message. */
  source?: "local" | "ollama";
}

// ── Self-hosted endpoint handling (pure) ────────────────────────────────

/** Normalize whatever the user pasted into a bare Ollama base URL.
 *  Accepts "localhost:11434", "http://host:11434", "http://host:11434/",
 *  "http://host:11434/api" and "http://host:11434/api/chat" alike. Returns ""
 *  for empty input. */
export function normalizeEndpoint(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  s = s.replace(/\/+$/, "");
  s = s.replace(/\/api\/chat$/i, "");
  s = s.replace(/\/api$/i, "");
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  return s;
}

/** The chat endpoint for a normalized base URL. */
export function ollamaChatUrl(base: string): string {
  return normalizeEndpoint(base) + "/api/chat";
}

// ── Attachment classification (pure) ────────────────────────────────────

const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "yaml", "yml", "toml",
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb", "rs", "go", "java", "kt",
  "c", "h", "cpp", "hpp", "cs", "php", "sh", "bash", "zsh", "sql", "html", "htm",
  "css", "scss", "xml", "svg", "ini", "cfg", "conf", "env", "log", "srt", "vtt"
]);

export function classifyAttachment(name: string, mime?: string): AttachmentKind {
  if (isImageFile(name, mime)) return "image";
  const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? "";
  if (TEXT_EXTS.has(ext)) return "text";
  if (mime?.startsWith("text/")) return "text";
  return "other";
}

/** Longest extracted preview kept per text attachment (characters). */
export const ATTACHMENT_TEXT_PREVIEW_LIMIT = 4000;

/** Cut a text attachment down to the preview limit. */
export function summarizeText(text: string): { preview: string; truncated: boolean } {
  const clean = text.replace(/\r\n/g, "\n");
  if (clean.length <= ATTACHMENT_TEXT_PREVIEW_LIMIT) return { preview: clean, truncated: false };
  return { preview: clean.slice(0, ATTACHMENT_TEXT_PREVIEW_LIMIT), truncated: true };
}

/** Base64 payload of a data URL (for Ollama vision `images`). */
export function dataUrlToBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

// ── The local (offline) brain ───────────────────────────────────────────

const GREETINGS = [
  "Hi hi! Talia here — whatcha we working on?",
  "Ooh, hello! I'm all ears!",
  "Hey hey! Ready when you are!"
];

const IDENTITY = [
  "I'm Talia! Your helper who lives right here on your computer. I can chat, read files and screenshots you give me, and if you connect me to a self-hosted model I get waaay smarter."
];

const CAPABILITIES = [
  "Here's my toolkit: paste or attach ANY file (screenshots, PDFs, code, you name it) and I'll look at it; talk to me with the mic; and point me at a self-hosted Ollama model in Settings for full brainpower. Everything stays on your machine!"
];

const THANKS = ["You're so welcome!", "Anytime! Hi-five! 🙌", "That's what I'm here for!"];

const JOKES = [
  "Why did the computer go to art school? Because it had a great mouse pad! 🖱️",
  "What do you call a robot who takes too long? R2-Delayed! 🤖",
  "Why was the spreadsheet cold? It left its Windows open! 🥶"
];

const FALLBACKS = [
  "Hmm, interesting! Tell me a bit more?",
  "Ooh okay — I'm listening. Got more details?",
  "I'm a small offline brain, so I might be missing context — but I'm HERE for it. Tell me more!"
];

const pick = (lines: string[], rng: () => number): string =>
  lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))] ?? lines[0];

/** Tiny safe arithmetic: finds "12*(3+4)"-style expressions inside input and
 *  evaluates them without eval() via shunting-yard + RPN. */
export function safeArithmetic(input: string): string | null {
  // Spoken math often uses "x" for multiply ("7x6") — replaced only inside a
  // candidate expression, so words like "box" never matter.
  const candidates = input.match(/[-+*/().\d]+/g) ?? [];
  for (const raw of candidates) {
    const cand = raw.replace(/x/gi, "*");
    if (!/\d/.test(cand) || !/[-+*/]/.test(cand)) continue;
    if (!/^[-+*/().\d]+$/.test(cand)) continue;
    const tokens = cand.match(/(\d+\.?\d*|[-+*/()])/g);
    if (!tokens || tokens.join("") !== cand) continue;
    const value = evaluateTokens(tokens);
    if (value !== null) return String(value);
  }
  return null;
}

const TOKEN_PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function evaluateTokens(tokens: string[]): number | null {
  // Shunting-yard to RPN…
  const out: string[] = [];
  const ops: string[] = [];
  for (const t of tokens) {
    if (/^\d/.test(t)) out.push(t);
    else if (t === "(") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      if (!ops.length) return null; // unbalanced
      ops.pop();
    } else {
      while (ops.length && TOKEN_PREC[ops[ops.length - 1]] >= TOKEN_PREC[t]) out.push(ops.pop()!);
      ops.push(t);
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === "(") return null;
    out.push(op);
  }
  // …then evaluate the RPN.
  const st: number[] = [];
  for (const t of out) {
    if (/^\d/.test(t)) st.push(parseFloat(t));
    else {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) return null;
      st.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : a / b);
    }
  }
  if (st.length !== 1 || !Number.isFinite(st[0])) return null;
  return Math.round(st[0] * 1e6) / 1e6;
}

const timeLine = (now: number): string => {
  const d = new Date(now);
  return `Right now it's ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} on ${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.`;
};

/** Rule-based offline reply. Deterministic given (input, now, rng). */
export function buildLocalReply(input: string, opts: { hasAttachments?: boolean; attachmentNames?: string[]; now?: number; rng?: () => number } = {}): string {
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? Date.now();
  const t = input.trim().toLowerCase();
  if (opts.hasAttachments && t.length < 25) {
    const names = opts.attachmentNames?.length ? ` (${opts.attachmentNames.join(", ")})` : "";
    return `Got it${names} — I can see your file right here in the chat! Connect a self-hosted model in Settings and I'll analyze it in depth.`;
  }
  if (!t) return pick(FALLBACKS, rng);
  if (/^(hi|hiya|hello|hey|yo|sup|good (morning|afternoon|evening))\b/.test(t)) return pick(GREETINGS, rng);
  if (/(who are you|your name|what are you)/.test(t)) return pick(IDENTITY, rng);
  if (/(what can you do|help|capabilities|features|commands)/.test(t)) return pick(CAPABILITIES, rng);
  if (/(thank|thanks|thx|ty\b)/.test(t)) return pick(THANKS, rng);
  if (/(joke|funny|make me laugh)/.test(t)) return pick(JOKES, rng);
  if (/\b(time|date|day is it|today)\b/.test(t) && t.length < 40) return timeLine(now);
  const math = safeArithmetic(t);
  if (math !== null) return `That's ${math}! ✨ Easy peasy.`;
  return pick(FALLBACKS, rng);
}

// ── System prompt for self-hosted models ────────────────────────────────

export function buildSystemPrompt(): string {
  return (
    "You are Talia, a cheerful kid personal assistant built into an offline-first office suite. " +
    "You sound playful, warm and encouraging (think friendly kid genius), keep answers short and clear, " +
    "and you never pretend to browse the web or access anything outside the user's machine. " +
    "Attachments shown to you come from the user's own files. If you don't know something, say so honestly."
  );
}

// ── Ollama client ───────────────────────────────────────────────────────

export const OLLAMA_TIMEOUT_MS = 90_000;

interface OllamaChatResponse {
  message?: { role?: string; content?: string };
  error?: string;
}

/** Ask a self-hosted Ollama-compatible endpoint. Throws on any failure so the
 *  caller can fall back to the local brain. */
export async function askOllama(endpoint: string, model: string, history: ChatMessage[], system: string): Promise<string> {
  const url = ollamaChatUrl(endpoint);
  const messages: { role: string; content: string; images?: string[] }[] = [{ role: "system", content: system }];
  for (const m of history.slice(-12)) {
    const images = (m.attachments ?? []).filter((a) => a.kind === "image" && a.dataUrl).map((a) => dataUrlToBase64(a.dataUrl!));
    const textPreview = (m.attachments ?? [])
      .filter((a) => a.kind === "text" && a.textPreview)
      .map((a) => `\n\n--- Attached file: ${a.name} ---\n${a.textPreview}${a.truncated ? "\n(preview truncated)" : ""}`)
      .join("");
    messages.push({
      role: m.role === "talia" ? "assistant" : "user",
      content: (m.text || "(attachment)") + textPreview,
      ...(images.length ? { images } : {})
    });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const data = (await res.json()) as OllamaChatResponse;
    if (data.error) throw new Error(data.error);
    const text = (data.message?.content ?? "").trim();
    if (!text) throw new Error("Ollama returned an empty reply");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ── Unified entry point ─────────────────────────────────────────────────

export interface TaliaRequest {
  input: string;
  history: ChatMessage[];
  attachments: TaliaAttachment[];
  /** Self-hosted Ollama base URL; empty = local brain only. */
  endpoint?: string;
  /** Model name on that endpoint (e.g. "llama3.2", "qwen2.5vl"). */
  model?: string;
  now?: number;
  rng?: () => number;
}

export interface TaliaAnswer {
  text: string;
  source: "local" | "ollama";
  /** Set when a self-hosted model was requested but fell back to local. */
  fallbackReason?: string;
}

/** Ask Talia. Prefers the self-hosted model when configured; any failure
 *  (offline, bad URL, missing model) degrades to the built-in brain. */
export async function askTalia(req: TaliaRequest): Promise<TaliaAnswer> {
  const endpoint = (req.endpoint ?? "").trim();
  const model = (req.model ?? "").trim();
  if (endpoint && model) {
    try {
      const text = await askOllama(endpoint, model, [...req.history, { id: "live", role: "user", text: req.input, ts: req.now ?? Date.now(), attachments: req.attachments }], buildSystemPrompt());
      return { text, source: "ollama" };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { text: buildLocalReply(req.input, { hasAttachments: req.attachments.length > 0, attachmentNames: req.attachments.map((a) => a.name), now: req.now, rng: req.rng }), source: "local", fallbackReason: reason };
    }
  }
  return { text: buildLocalReply(req.input, { hasAttachments: req.attachments.length > 0, attachmentNames: req.attachments.map((a) => a.name), now: req.now, rng: req.rng }), source: "local" };
}

/** Longest image edge kept for chat attachments (shared with docs). */
export const CHAT_IMAGE_MAX_EDGE = MAX_EMBEDDED_IMAGE_EDGE;
