// Global keyboard shortcut layer.
// One window-level listener routes Cmd/Ctrl combos to handlers registered by
// the active module, with app-wide fallbacks (palette, settings, save…).

export interface ShortcutContext {
  // returns true if the event was consumed
  handle: (action: string, e: KeyboardEvent) => boolean;
  module: string;
}

const platformMod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control";

export function isMod(e: KeyboardEvent | MouseEvent): boolean {
  return platformMod === "Meta" ? e.metaKey : e.ctrlKey;
}

export function modLabel(): string {
  return platformMod === "Meta" ? "⌘" : "Ctrl";
}

type Handler = (e: KeyboardEvent) => boolean | void;

let currentHandler: Handler | null = null;

/** Modules call this when they mount/unmount to receive shortcut events. */
export function registerShortcuts(handler: Handler | null): void {
  currentHandler = handler;
}

/** Install the single global listener (called once from App). */
export function installShortcutListener(fallbacks: Handler): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (currentHandler && currentHandler(e)) return;
      fallbacks(e);
    },
    { capture: true }
  );
}

/** Parse "mod+shift+k" style specs into a matcher. */
export function matches(e: KeyboardEvent, spec: string): boolean {
  const parts = spec.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const needMod = parts.includes("mod");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");
  const mod = e.metaKey || e.ctrlKey;
  if (needMod !== mod) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;
  return e.key.toLowerCase() === key;
}
