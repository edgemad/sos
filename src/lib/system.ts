// System-action service: wires the Tauri `system_cleanup` IPC to the UI
// with progressive loading, cancellation and user-facing results.
import { writable, get } from "svelte/store";
import { isTauri, systemAction, type SystemActionPayload } from "./tauri";

/** Busy state for each action so the button can disable and show spinners. */
export interface SystemStatus {
  trashEmpty: "idle" | "busy";
  trashRecall: "idle" | "busy";
  trashForeach: "idle" | "busy";
  cacheClear: "idle" | "busy";
  tempClear: "idle" | "busy";
  findFiles: "idle" | "busy";
}

export const systemStatus = writable<SystemStatus>({
  trashEmpty: "idle",
  trashRecall: "idle",
  trashForeach: "idle",
  cacheClear: "idle",
  tempClear: "idle",
  findFiles: "idle",
});

export interface SystemResult {
  ok: boolean;
  action: string;
  detail: string;
  count?: number;
}

let currentRun: Promise<SystemActionPayload> | null = null;

async function run<T extends keyof SystemStatus>(
  action: T,
  fn: (payload: SystemActionPayload) => void,
  args?: Record<string, unknown>,
): Promise<SystemResult> {
  const status = get(systemStatus);
  if (status[action] === "busy") return { ok: false, action: action as string, detail: "Already running" };
  systemStatus.update((s) => ({ ...s, [action]: "busy" }));
  try {
    const payload = await systemAction(action as string, args);
    fn(payload);
    return payload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, action: action as string, detail: msg };
  } finally {
    systemStatus.update((s) => ({ ...s, [action]: "idle" }));
  }
}

/** Empty the OS trash. macOS presents the dock icon; Unix/Windows clear
 *  the Trash folders directly. */
export async function emptyTrash(): Promise<SystemResult> {
  return run("trashEmpty", (p) => {
    if (p.ok) {
      // Store the result somewhere the settings drawer can display it.
      void (window as unknown as { __sosSystemToast?: (m: string) => void }).__sosSystemToast?.(p.detail + (p.count !== undefined ? ` (${p.count} item${p.count > 1 ? "s" : ""})` : ""));
    }
  });
}

/** Recall/remove a specific path under $HOME. */
export async function recallTrash(path: string): Promise<SystemResult> {
  return run("trashRecall", (p) => {
    if (p.ok) void (window as unknown as { __sosSystemToast?: (m: string) => void }).__sosSystemToast?.(`Removed ${path}`);
  }, { path });
}

/** List candidate items under the whitelisted roots (for the "what is in
 *  the trash?" overview before committing a bulk delete). */
export async function listTrashCandidates(): Promise<SystemResult> {
  return run("trashForeach", (p) => {
    if (p.ok) void (window as unknown as { __sosSystemToast?: (m: string) => void }).__sosSystemToast?.(p.detail);
  });
}

/** Clear the cross-platform cache/state dirs. */
export async function clearCache(): Promise<SystemResult> {
  return run("cacheClear", (p) => {
    if (p.ok) void (window as unknown as { __sosSystemToast?: (m: string) => void }).__sosSystemToast?.(p.detail + (p.count !== undefined ? ` (${p.count} dir${p.count > 1 ? "s" : ""})` : ""));
  });
}

/** Clear the cross-platform temp dir. */
export async function clearTemp(): Promise<SystemResult> {
  return run("tempClear", (p) => {
    if (p.ok) void (window as unknown as { __sosSystemToast?: (m: string) => void }).__sosSystemToast?.(p.detail + (p.count !== undefined ? ` (${p.count} folder${p.count > 1 ? "s" : ""})` : ""));
  });
}

/** Find files: a safe walk over user-visible roots. */
export interface FindOptions {
  base: "downloads" | "desktop" | "documents" | "pictures" | "home";
  pattern: string;
  recursive: boolean;
}

export interface FindResult {
  ok: boolean;
  action: "find_files";
  detail: string;
  count: number;
  files: string[];
}

export async function findFiles(opts: FindOptions): Promise<FindResult> {
  const status = get(systemStatus);
  if (status.findFiles === "busy") return { ok: false, action: "find_files", detail: "Already running", count: 0, files: [] };
  systemStatus.update((s) => ({ ...s, findFiles: "busy" }));
  try {
    const payload = await systemAction("find_files", {
      base: opts.base,
      pattern: opts.pattern,
      recursive: opts.recursive,
    });
    if (!payload.ok) return { ok: false, action: "find_files", detail: payload.detail, count: 0, files: [] };
    const files = (payload as FindResult & { files?: string[] }).files ?? [];
    return { ok: true, action: "find_files", detail: payload.detail, count: files.length, files };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, action: "find_files", detail: msg, count: 0, files: [] };
  } finally {
    systemStatus.update((s) => ({ ...s, findFiles: "idle" }));
  }
}

/** Expose a global hook so any module can surface a system result without
 *  importing state.ts (avoids a circular dependency). */
export function setSystemToast(fn: (msg: string) => void): void {
  (window as unknown as { __sosSetSystemToast?: (f: (m: string) => void) => void }).__sosSetSystemToast?.(fn);
}
