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

function ask(kind: AskKind, title: string, value: string, placeholder: string): Promise<string | null> {
  // Real natives still work in plain browsers — use them when available.
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

export function registerToastHost(fn: ((t: ToastMsg[]) => void) | null): void {
  toastNotify = fn;
  if (toasts.length) fn?.(toasts);
}

export function toast(msg: string): void {
  const t = { id: ++toastSeq, msg };
  toasts = [...toasts, t];
  toastNotify?.(toasts);
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastNotify?.(toasts);
  }, 2600);
}
