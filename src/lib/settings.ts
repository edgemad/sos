// App settings: persisted preferences surfaced in the Settings modal and
// native menu. Syncs theme, autosave cadence, editor font, default zoom and
// voice (read-aloud) preferences.

import { writable } from "svelte/store";
import { applyThemePreset, DEFAULT_THEME_ID } from "./themes";

export interface SosSettings {
  autosave: boolean;
  autosaveMs: number;
  editorFont: string;
  editorFontSize: number;
  defaultZoom: number;
  showStatusBar: boolean;
  defaultDocsZoom: number;
  voiceEnabled: boolean;
  voiceRate: number;
  voiceName: string;
  /** Talia's speaking persona: "kid" (cute, brighter) or "assistant". */
  voicePersona: "kid" | "assistant";
  /** Voice pitch 0.5–2 — higher sounds younger. */
  voicePitch: number;
  /** Self-hosted Ollama base URL ("" = built-in offline brain only). */
  taliaEndpoint: string;
  /** Model name on the self-hosted endpoint (e.g. "llama3.2"). */
  taliaModel: string;
  /** Kid/teen theme preset id (see lib/themes.ts). */
  themePreset: string;
}

const KEY = "sos.settings.v1";

const defaults: SosSettings = {
  autosave: true,
  autosaveMs: 600,
  editorFont: "'Segoe UI', system-ui, -apple-system, sans-serif",
  editorFontSize: 14,
  defaultZoom: 100,
  showStatusBar: true,
  defaultDocsZoom: 100,
  voiceEnabled: true,
  voiceRate: 1,
  voiceName: "",
  voicePersona: "kid",
  voicePitch: 1.4,
  taliaEndpoint: "",
  taliaModel: "",
  themePreset: DEFAULT_THEME_ID
};

function load(): SosSettings {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SosSettings>) : {};
    return { ...defaults, ...parsed, voicePersona: parsed.voicePersona === "assistant" ? "assistant" : "kid" };
  } catch {
    return defaults;
  }
}

export const settings = writable<SosSettings>(load());

let lastTheme = "";
settings.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* non-fatal */
  }
  // Theme presets apply instantly on change (never clobber a module accent
  // that App.svelte set for an editor module).
  if (s.themePreset !== lastTheme) {
    lastTheme = s.themePreset;
    applyThemePreset(s.themePreset);
  }
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--sos-editor-font", s.editorFont);
    document.documentElement.style.setProperty("--sos-editor-size", `${s.editorFontSize}px`);
  }
});

export function resetSettings(): void {
  settings.set(defaults);
}
