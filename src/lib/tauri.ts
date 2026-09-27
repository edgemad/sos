// Tauri IPC bridge with graceful browser fallbacks.
// Every helper works both inside the Tauri webview and in a plain browser,
// so `npm run dev` remains usable without the Rust side.

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

let cachedInvoke: InvokeFn | null = null;
let tauriAvailable: boolean | null = null;

async function getInvoke(): Promise<InvokeFn | null> {
  if (tauriAvailable === false) return null;
  if (cachedInvoke) return cachedInvoke;
  try {
    const mod = await import("@tauri-apps/api/core");
    cachedInvoke = mod.invoke as unknown as InvokeFn;
    tauriAvailable = true;
    return cachedInvoke;
  } catch {
    tauriAvailable = false;
    return null;
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface OpenedPayload {
  path: string;
  name: string;
  content: string;
}

/** Native open dialog. Falls back to a hidden <input type=file> in browsers. */
export async function openFileDialog(extensions?: string[]): Promise<OpenedPayload | null> {
  const invoke = await getInvoke();
  if (invoke) {
    return (await invoke("open_file_dialog", { extensions: extensions ?? null })) as
      | OpenedPayload
      | null;
  }
  return browserPickFile(extensions);
}

function browserPickFile(extensions?: string[]): Promise<OpenedPayload | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (extensions?.length) input.accept = extensions.map((e) => "." + e).join(",");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ path: file.name, name: file.name, content: String(reader.result ?? "") });
      reader.readAsText(file);
    };
    input.click();
  });
}

/** Native save dialog. Falls back to a download in browsers. */
export async function saveFileDialog(fileName: string, contents: string): Promise<string | null> {
  const invoke = await getInvoke();
  if (invoke) {
    return (await invoke("save_file_dialog", { fileName, contents })) as string | null;
  }
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return fileName;
}

/** Overwrite a known path (auto-save). Browser builds no-op safely. */
export async function writeFile(path: string, contents: string): Promise<boolean> {
  const invoke = await getInvoke();
  if (!invoke) return false;
  try {
    await invoke("write_text_file", { path, contents });
    return true;
  } catch (e) {
    console.error("write_text_file failed", e);
    return false;
  }
}

export interface SystemInfoPayload {
  app_version: string;
  total_memory_mb: number;
  used_memory_mb: number;
  os_name: string;
  os_version: string;
}

export async function systemInfo(): Promise<SystemInfoPayload | null> {
  const invoke = await getInvoke();
  if (!invoke) return null;
  try {
    return (await invoke("system_info")) as SystemInfoPayload;
  } catch {
    return null;
  }
}
