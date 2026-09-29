// App-wide replacement for window.prompt/alert/confirm, which are silent
// no-ops inside Tauri's WKWebView. Any module can import these helpers; the
// dialog/toast UI is rendered once, from App.svelte.

export type AskKind = "prompt" | "confirm";

export interface AskRequest {
  kind: AskKind;
  title: string;
  value: string;
  placeholder: string;
  resolve: (v: string | null) => void;
}

let current: AskRequest | null = null;
let notify: ((r: AskRequest | null) => void) | null = null;

/** App.svelte registers a renderer here. */
export function registerAskHost(fn: ((r: AskRequest | null) => void) | null): void {
  notify = fn;
  if (current) fn?.(current);
}

/** True inside the Tauri webview, where window.prompt/confirm exist but are
 *  silent no-ops (WKWebView/WebView2) — they must never be trusted there. */
function isTauriWebView(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function ask(kind: AskKind, title: string, value: string, placeholder: string): Promise<string | null> {
  // Real natives still work in plain browsers — use them there, but never in
  // Tauri where they resolve instantly with null/false (silent data loss).
  if (!isTauriWebView()) {
    if (kind === "prompt" && typeof window !== "undefined" && window.prompt) {
      try {
        const v = window.prompt(title, value);
        return Promise.resolve(v === null ? null : String(v));
      } catch {
        /* fall through to in-app dialog */
      }
    }
    if (kind === "confirm" && typeof window !== "undefined" && window.confirm) {
      try {
        return Promise.resolve(window.confirm(title) ? "ok" : null);
      } catch {
        /* fall through to in-app dialog */
      }
    }
  }
  // No dialog host mounted (App not ready): never hang the caller forever.
  if (!notify) return Promise.resolve(null);
  return new Promise((resolve) => {
    current = { kind, title, value, placeholder, resolve };
    notify?.(current);
  });
}

export function appPrompt(title: string, value = "", placeholder = ""): Promise<string | null> {
  return ask("prompt", title, value, placeholder);
}

export function appConfirm(title: string): Promise<string | null> {
  return ask("confirm", title, "", "");
}

/** Called by the dialog UI in App.svelte. */
export function resolveAsk(v: string | null): void {
  current?.resolve(v);
  current = null;
  notify?.(null);
}

// ── Toasts ──────────────────────────────────────────────────────

export interface ToastMsg {
  id: number;
  msg: string;
}

let toasts: ToastMsg[] = [];
let toastNotify: ((t: ToastMsg[]) => void) | null = null;
let toastSeq = 0;
let pending: string[] = [];

export function registerToastHost(fn: ((t: ToastMsg[]) => void) | null): void {
  toastNotify = fn;
  if (toasts.length) fn?.(toasts);
}

/** Replay toasts queued before the host mounted (early startup errors). */
export function flushPendingToasts(): void {
  if (pending.length && toastNotify) {
    for (const m of pending) toast(m);
    pending = [];
  }
}

export function toast(msg: string): void {
  // No host yet (App.svelte not mounted): queue instead of dropping.
  if (!toastNotify) {
    pending = [...pending.slice(-4), msg];
    return;
  }
  const t = { id: ++toastSeq, msg };
  toasts = [...toasts, t];
  toastNotify?.(toasts);
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastNotify?.(toasts);
  }, 2600);
}
