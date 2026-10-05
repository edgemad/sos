// Voice capability for Talia: read-aloud (text-to-speech) and voice typing
// (speech recognition), built exclusively on the browser's built-in Web
// Speech APIs — zero dependencies and no network calls of our own. Every
// entry point is guarded, so the app degrades gracefully where the platform
// lacks speech support. Pure helpers are exported for unit tests.

import { writable } from "svelte/store";

// ── Support probes ──────────────────────────────────────────────────────

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onresult: ((e: any) => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return recognitionCtor() !== null;
}

// ── Live state (status bar) ─────────────────────────────────────────────

/** True while the synthesizer is reading text aloud. */
export const isSpeaking = writable(false);
/** True while a microphone dictation session is active. */
export const isListening = writable(false);
/** Live microphone loudness 0..1 for the voice orb (0 when not monitored). */
export const micLevel = writable(0);
/** Latest interim dictation transcript ("" when none). */
export const interimText = writable("");
/** Bumped on every spoken word boundary — drives the orb's word pulse. */
export const speakPulse = writable(0);

/** Platform voice list, refreshed as the engine loads it (Chromium loads
 *  voices asynchronously on cold start). */
export const speechVoices = writable<SpeechSynthesisVoice[]>([]);

function refreshVoices(): void {
  if (!isSpeechSynthesisSupported()) return;
  speechVoices.set(window.speechSynthesis.getVoices());
}

if (isSpeechSynthesisSupported()) {
  refreshVoices();
  window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  // Chromium loads the voice list async on cold start — poll a couple times.
  window.setTimeout(refreshVoices, 400);
  window.setTimeout(refreshVoices, 1500);
}

// ── Mic loudness (drives the orb while listening) ───────────────────────

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let micStream: MediaStream | null = null;
let rafId = 0;
let micGen = 0;

/** Start sampling mic loudness into `micLevel` (0..1). Silently no-ops when
 *  getUserMedia is unavailable or permission is denied — the orb then falls
 *  back to its CSS-only pulse. */
export async function startMicLevel(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || micStream) return;
  const gen = ++micGen;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (gen !== micGen || micStream) {
      // Session ended (or restarted) while the permission prompt was up —
      // release the device immediately instead of leaking it.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    micStream = stream;
    const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) {
      stopMicLevel();
      return;
    }
    audioCtx = new Ctx() as AudioContext;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = (): void => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      micLevel.set(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  } catch {
    stopMicLevel(); // permission denied or no device — degrade quietly
  }
}

/** Stop sampling mic loudness and release the device. */
export function stopMicLevel(): void {
  micGen++; // invalidate any in-flight startMicLevel
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  analyser = null;
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
  if (audioCtx) {
    void audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  micLevel.set(0);
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────

/** Collapse whitespace and strip zero-width characters so the synthesizer
 *  reads prose. Callers pass plain text (see htmlToText), never HTML. */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clamp a rate into the Web Speech API's valid 0.5–2 range (1 = normal). */
export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(2, Math.max(0.5, Math.round(rate * 10) / 10));
}

/** Split text into utterance-sized chunks. Synthesizers choke on very long
 *  strings, so we break on sentence boundaries (never inside numbers like
 *  3.14) and recombine up to `maxLen` characters per chunk. */
export function chunkTextForSpeech(text: string, maxLen = 220): string[] {
  const clean = sanitizeForSpeech(text);
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  // Sentence-ish pieces: break after punctuation only when whitespace (or
  // end of text) follows — "pi. " breaks, the dot in "3.14" does not.
  const pieces: string[] = [];
  let start = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if ((ch === "." || ch === "!" || ch === "?" || ch === "…") && (i === clean.length - 1 || /\s/.test(clean[i + 1]))) {
      pieces.push(clean.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < clean.length) pieces.push(clean.slice(start));

  // Recombine pieces into chunks no longer than maxLen.
  const chunks: string[] = [];
  let cur = "";
  const push = (): void => {
    const t = cur.trim();
    if (t) chunks.push(t);
    cur = "";
  };
  for (const piece of pieces) {
    const p = piece.trim();
    if (!p) continue;
    if (p.length > maxLen) {
      push();
      for (const part of splitLongSentence(p, maxLen)) chunks.push(part);
      continue;
    }
    if (cur && (cur + " " + p).length > maxLen) push();
    cur = cur ? cur + " " + p : p;
  }
  push();
  return chunks;
}

function splitLongSentence(sentence: string, maxLen: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of sentence.split(" ")) {
    if (line && (line + " " + word).length > maxLen) {
      out.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  if (line) out.push(line);
  return out;
}

/** Structural subset of SpeechSynthesisVoice, so tests can pass plain
 *  objects; real platform voices satisfy it too. */
export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
}

/** Choose the best voice: exact name → name prefix → language match →
 *  language prefix → platform default → first available. */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], preferredName?: string, lang?: string): T | null {
  if (voices.length === 0) return null;
  if (preferredName) {
    const exact = voices.find((v) => v.name === preferredName);
    if (exact) return exact;
    const prefix = voices.find((v) => v.name.startsWith(preferredName));
    if (prefix) return prefix;
  }
  if (lang) {
    const base = lang.slice(0, 2).toLowerCase();
    const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
    if (exact) return exact;
    const loose = voices.find((v) => v.lang.toLowerCase().slice(0, 2) === base);
    if (loose) return loose;
  }
  return voices.find((v) => v.default) ?? voices[0];
}

// ── Dictation commands (Jarvis-style voice control) ───────────────────

export type DictationAction = "insert" | "stop" | "newline";

export interface DictationCommand {
  action: DictationAction;
  /** Text to insert (insert action only). */
  text?: string;
}

const DICTATION_STOPS = new Set(["stop listening", "stop dictation", "go to sleep", "jarvis stop"]);
const DICTATION_NEWLINES = new Set(["new paragraph", "new line", "newline"]);
const DICTATION_PUNCT: Record<string, string> = {
  period: ".",
  "full stop": ".",
  comma: ",",
  "question mark": "?",
  "exclamation mark": "!",
  "exclamation point": "!"
};

/** Interpret a final dictation transcript as either a voice command or plain
 *  text to insert. Commands must match exactly (after trimming, lowercasing
 *  and stripping trailing punctuation); everything else passes through. */
export function parseDictation(transcript: string): DictationCommand {
  const t = transcript.trim().toLowerCase().replace(/[.!?…]+$/, "");
  if (DICTATION_STOPS.has(t)) return { action: "stop" };
  if (DICTATION_NEWLINES.has(t)) return { action: "newline" };
  if (t in DICTATION_PUNCT) return { action: "insert", text: DICTATION_PUNCT[t] };
  return { action: "insert", text: transcript.trim() };
}

// ── Text-to-speech (read aloud) ─────────────────────────────────────────

export interface SpeakOptions {
  /** Reading speed, 0.5–2 (1 = normal). Clamped automatically. */
  rate?: number;
  /** Preferred platform voice by name ("" = automatic). */
  voiceName?: string;
  /** BCP-47 language hint, e.g. navigator.language. */
  lang?: string;
  /** Called once when the last chunk finishes naturally. */
  onEnd?: () => void;
}

let speakGeneration = 0;

/** Speak text aloud. Returns false when speech synthesis is unavailable or
 *  the text is empty. Any ongoing read-aloud is replaced. */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  const synth = window.speechSynthesis;
  const chunks = chunkTextForSpeech(text);
  if (chunks.length === 0) return false;

  synth.cancel(); // never overlap a previous read-aloud
  const voice = pickVoice(synth.getVoices(), opts.voiceName, opts.lang) ?? undefined;
  const queue = chunks.map((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    if (voice) u.voice = voice;
    else if (opts.lang) u.lang = opts.lang;
    u.rate = clampRate(opts.rate ?? 1);
    u.onboundary = () => speakPulse.update((n) => n + 1); // orb word pulse
    if (i === chunks.length - 1) {
      const done = opts.onEnd;
      u.onend = () => {
        isSpeaking.set(false);
        done?.();
      };
      u.onerror = () => isSpeaking.set(false);
    }
    return u;
  });

  const gen = ++speakGeneration;
  isSpeaking.set(true);
  // Chromium quirk: utterances queued in the same tick as cancel() can be
  // dropped — start the queue a beat later, guarded by generation.
  window.setTimeout(() => {
    if (gen !== speakGeneration) return; // stopSpeaking()/a newer speak() won
    for (const u of queue) synth.speak(u);
  }, 50);
  return true;
}

/** Stop any ongoing read-aloud and cancel queued speech. */
export function stopSpeaking(): void {
  speakGeneration++; // invalidate any pending queue
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
  isSpeaking.set(false);
}

// ── Speech recognition (voice typing) ───────────────────────────────────

export interface VoiceTypingCallbacks {
  /** Final, committed transcript pieces. */
  onFinal: (text: string) => void;
  /** Interim (not-yet-final) transcript, if you want live feedback. */
  onPartial?: (text: string) => void;
  /** Microphone session started/stopped. */
  onStateChange?: (active: boolean) => void;
  /** Platform error name ("not-allowed", "no-speech", …). "aborted" is
   *  swallowed — it accompanies every deliberate stop(). */
  onError?: (error: string) => void;
  /** BCP-47 language (defaults to the platform locale). */
  lang?: string;
  /** Keep listening until stop() (default true). */
  continuous?: boolean;
}

export interface VoiceTypingHandle {
  start(): void;
  stop(): void;
  readonly active: boolean;
}

let activeTyping: VoiceTypingHandle | null = null;

/** Stop the most recently created dictation session (used by the voice orb). */
export function stopVoiceTyping(): void {
  activeTyping?.stop();
}

/** Build a dictation recognizer on the platform's Web Speech API.
 *  Returns null when speech recognition is unavailable. */
export function createVoiceTyping(cb: VoiceTypingCallbacks): VoiceTypingHandle | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  let rec: RecognitionLike;
  try {
    rec = new Ctor();
  } catch {
    return null;
  }

  let active = false;
  const setActive = (v: boolean): void => {
    if (active === v) return;
    active = v;
    isListening.set(v);
    cb.onStateChange?.(v);
  };

  rec.lang = cb.lang ?? (navigator.language || "en-US");
  rec.continuous = cb.continuous ?? true;
  rec.interimResults = true;

  rec.onstart = () => setActive(true);
  rec.onend = () => {
    setActive(false);
    interimText.set("");
  };
  rec.onerror = (e) => {
    setActive(false);
    const err = e?.error ?? "unknown";
    if (err !== "aborted") cb.onError?.(err);
  };
  rec.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const text: string = result?.[0]?.transcript ?? "";
      if (result?.isFinal) {
        const final = text.trim();
        if (final) cb.onFinal(final);
      } else {
        interim += text;
      }
    }
    const partial = interim.trim();
    interimText.set(partial); // the orb shows the live transcript
    if (partial) cb.onPartial?.(partial);
  };

  const handle: VoiceTypingHandle = {
    start(): void {
      if (active) return;
      try {
        rec.start();
      } catch {
        /* start() throws if already started — ignore */
      }
    },
    stop(): void {
      if (!active) return;
      try {
        rec.stop();
      } catch {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
      }
    },
    get active(): boolean {
      return active;
    }
  };
  activeTyping = handle;
  return handle;
}
