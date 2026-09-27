// Bridges native Tauri menu events ("sos://menu") into a single callback,
// so the webview can react to native menu items identically on all OSes.

type MenuAction = string;

type Listener = (action: MenuAction) => void;

export async function onNativeMenu(listener: Listener): Promise<() => void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return () => {};
  }
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<MenuAction>("sos://menu", (e) => listener(e.payload));
    return unlisten;
  } catch {
    return () => {};
  }
}
