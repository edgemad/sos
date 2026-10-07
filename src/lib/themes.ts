// Theme presets: kid-and-teen friendly color worlds for the whole chrome.
// Each preset re-tints the liquid-glass accent and the ambient aurora blobs;
// picking one is instant and persists via settings (no reload).

export interface ThemePreset {
  id: string;
  label: string;
  emoji: string;
  /** Chrome accent (buttons, highlights, active nav). */
  accent: string;
  /** Ambient aurora blob colors. */
  blobB: string;
  blobC: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "sunny", label: "Sunny", emoji: "☀️", accent: "#1a73e8", blobB: "#34a853", blobC: "#a142f4" },
  { id: "candy", label: "Candy", emoji: "🍬", accent: "#e91e8c", blobB: "#ff8a65", blobC: "#7c4dff" },
  { id: "ocean", label: "Ocean", emoji: "🌊", accent: "#00897b", blobB: "#26c6da", blobC: "#5c6bc0" },
  { id: "galaxy", label: "Galaxy", emoji: "🌌", accent: "#7c4dff", blobB: "#3f51b5", blobC: "#e040fb" },
  { id: "forest", label: "Forest", emoji: "🌳", accent: "#2e7d32", blobB: "#66bb6a", blobC: "#8d6e63" },
  { id: "sunset", label: "Sunset", emoji: "🌇", accent: "#f4511e", blobB: "#ffb300", blobC: "#ec407a" }
];

export const DEFAULT_THEME_ID = "sunny";

/** Look up a preset by id, falling back to the default for unknown values. */
export function themeById(id: string | undefined | null): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0];
}

/** Apply a preset to the document: accent + ambient blob colors. Safe to
 *  call on every settings change; no-op outside a browser. */
export function applyThemePreset(id: string | undefined | null): void {
  if (typeof document === "undefined") return;
  const t = themeById(id);
  const root = document.documentElement;
  root.style.setProperty("--sos-accent", t.accent);
  root.style.setProperty("--sos-blob-b", t.blobB);
  root.style.setProperty("--sos-blob-c", t.blobC);
}
