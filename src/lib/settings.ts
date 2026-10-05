// App settings: persisted preferences surfaced in the Settings modal and
// native menu. Syncs theme, autosave cadence, editor font, default zoom and
// voice (read-aloud) preferences.

import { writable } from "svelte/store";

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
  voiceName: ""
};

function load(): SosSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as SosSettings) } : defaults;
  } catch {
    return defaults;
  }
}

export const settings = writable<SosSettings>(load());

settings.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* non-fatal */
  }
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--sos-editor-font", s.editorFont);
    document.documentElement.style.setProperty("--sos-editor-size", `${s.editorFontSize}px`);
  }
});

export function resetSettings(): void {
  settings.set(defaults);
}
