//! Simple Office Suite — Tauri 2 backend.
//!
//! Thin native layer: menus, dialogs, file I/O, OS telemetry and system
//! actions (trash, temp, cache, file find). All document logic lives in the
//! TypeScript layer so the suite keeps working identically in a plain browser.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;

// Native menus are desktop-only; Android/iOS builds skip this module.
#[cfg(desktop)]
use tauri::menu::{AboutMetadata, CheckMenuItem, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::Manager;
#[cfg(desktop)]
use tauri::{Emitter, Runtime};
use tauri_plugin_dialog::DialogExt;

mod system;
pub use system::{
    clear_cache, clear_temp, empty_trash, find_files, recall_trash, trash_items,
    trash_recall_paths, SearchQuery, SystemResult,
};

/// Result payload for file open operations.
#[derive(Serialize)]
pub struct OpenedFile {
    pub path: String,
    pub name: String,
    pub content: String,
}

/// Lightweight process / memory telemetry surfaced in the status bar.
#[derive(Serialize)]
pub struct SystemInfo {
    pub app_version: String,
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub os_name: String,
    pub os_version: String,
}

/// Ask the OS for a file to open. Returns `None` if the user cancels.
#[tauri::command]
async fn open_file_dialog(
    app: tauri::AppHandle,
    extensions: Option<Vec<String>>,
) -> Result<Option<OpenedFile>, String> {
    let mut builder = app.dialog().file().add_filter(
        "Supported documents",
        &[
            "json", "sos", "md", "txt", "csv", "png", "jpg", "jpeg", "gif", "svg", "webp",
        ],
    );
    if let Some(exts) = extensions {
        let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        builder = builder.add_filter("Files", &refs);
    }

    match builder.blocking_pick_file() {
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "untitled".into());
            Ok(Some(OpenedFile {
                path: path.to_string_lossy().to_string(),
                name,
                content: String::new(),
            }))
        }
        None => Ok(None),
    }
}

/// Ask the OS for an image file and return its path (for Slides image blocks).
#[tauri::command]
async fn pick_image_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter(
            "Images",
            &["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"],
        )
        .blocking_pick_file();
    match picked {
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

/// Ask the OS where to save, then write the file. Returns the path written.
#[tauri::command]
async fn save_file_dialog(
    app: tauri::AppHandle,
    file_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .blocking_save_file();

    match picked {
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            fs::write(&path, contents).map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

/// Write text straight to a known path (used by auto-save).
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Read a text file from a known path.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Make sure the workspace folder exists; returns its path.
#[tauri::command]
fn ensure_workspace_dir(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let base = app.path().document_dir().map_err(|e| e.to_string())?;
    let dir = base.join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// Basic system telemetry for the status bar.
#[tauri::command]
fn system_info(app: tauri::AppHandle) -> SystemInfo {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let used = sysinfo::get_current_pid()
        .ok()
        .map(|pid| {
            sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
            sys.process(pid).map(|p| p.memory()).unwrap_or(0)
        })
        .unwrap_or(0);

    SystemInfo {
        app_version: app.package_info().version.to_string(),
        total_memory_mb: sys.total_memory() / 1024 / 1024,
        used_memory_mb: used / 1024 / 1024,
        os_name: sysinfo::System::name().unwrap_or_else(|| "Unknown".into()),
        os_version: sysinfo::System::os_version().unwrap_or_default(),
    }
}

/// System-action IPC: routes `action` to the backend. Every command is
/// constrained to user-writable paths ($HOME and its subdirs), so nothing
/// outside the app's `fs:default` allowlist can ever be touched.
#[tauri::command]
async fn system_cleanup(app: tauri::AppHandle, action: String) -> Result<SystemResult, String> {
    let app = app.clone();
    match action.as_str() {
        "trash_empty" => Ok(empty_trash(app.clone()).await),
        "trash_recall" => Ok(recall_trash(app.clone()).await),
        "trash_foreach" => Ok(trash_items(app.clone()).await),
        "temp_clear" => Ok(clear_temp(app.clone()).await),
        "cache_clear" => Ok(clear_cache(app.clone()).await),
        "find_files" => {
            let q = SearchQuery::parse(&app, action)?;
            Ok(find_files(app, q).await)
        }
        _ => Err(format!("unknown system action: {action:?}")),
    }
}

/// Build the native application menu and wire menu events to the webview.
#[cfg(desktop)]
fn build_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let is_mac = cfg!(target_os = "macos");

    // ── App menu (macOS only shows under the app name) ─────────────
    let app_submenu = SubmenuBuilder::new(app, "Simple Office Suite")
        .about(Some(AboutMetadata {
            name: Some("Simple Office Suite".into()),
            version: Some(app.package_info().version.to_string()),
            authors: Some(vec!["Talia".into()]),
            comments: Some(
                "Offline-first office suite: documents, spreadsheets, presentations, forms, notes and calendar. All data stays on your machine."
                    .into(),
            ),
            copyright: Some("© 2026 Talia · MIT License".into()),
            credits: Some("Developed by Talia".into()),
            ..Default::default()
        }))
        .separator()
        .text("settings", "Settings…")
        .text("check_updates", "Check for Updates…")
        .separator()
        .text("quit", "Quit Simple Office Suite")
        .build()?;

    // ── File ────────────────────────────────────────────────────────
    let new_doc: MenuItem<R> = MenuItem::with_id(
        app,
        "new-doc",
        "New Document",
        true,
        Some("CmdOrCtrl+Alt+1"),
    )?;
    let new_sheet: MenuItem<R> = MenuItem::with_id(
        app,
        "new-sheet",
        "New Spreadsheet",
        true,
        Some("CmdOrCtrl+Alt+2"),
    )?;
    let new_deck: MenuItem<R> = MenuItem::with_id(
        app,
        "new-deck",
        "New Presentation",
        true,
        Some("CmdOrCtrl+Alt+3"),
    )?;
    let new_form: MenuItem<R> =
        MenuItem::with_id(app, "new-form", "New Form", true, Some("CmdOrCtrl+Alt+4"))?;
    let new_note: MenuItem<R> =
        MenuItem::with_id(app, "new-note", "New Note", true, Option::<&str>::None)?;
    let open_item: MenuItem<R> =
        MenuItem::with_id(app, "open", "Open .sos File…", true, Some("CmdOrCtrl+O"))?;
    let save_item: MenuItem<R> =
        MenuItem::with_id(app, "save", "Save to Disk", true, Some("CmdOrCtrl+S"))?;
    let export_pdf: MenuItem<R> = MenuItem::with_id(
        app,
        "export-pdf",
        "Export as PDF…",
        true,
        Some("CmdOrCtrl+P"),
    )?;
    let settings_item: MenuItem<R> =
        MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let system_item: MenuItem<R> = MenuItem::with_id(
        app,
        "system",
        "System tasks…",
        true,
        Some("CmdOrCtrl+Shift+;"),
    )?;

    let file_submenu = SubmenuBuilder::new(app, "File")
        .item(&new_doc)
        .item(&new_sheet)
        .item(&new_deck)
        .item(&new_form)
        .item(&new_note)
        .separator()
        .item(&open_item)
        .item(&save_item)
        .item(&export_pdf)
        .separator()
        .item(&settings_item)
        .item(&system_item)
        .build()?;

    // ── Edit ────────────────────────────────────────────────────────
    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .text("find", "Find & Replace…")
        .build()?;

    // ── View ────────────────────────────────────────────────────────
    let dark_toggle: CheckMenuItem<R> = CheckMenuItem::with_id(
        app,
        "dark_mode",
        "Dark Mode",
        true,
        false,
        Some("CmdOrCtrl+Alt+D"),
    )?;
    let view_submenu = SubmenuBuilder::new(app, "View")
        .text("command_palette", "Command Palette")
        .text("toggle_sidebar", "Toggle Sidebar")
        .text("toggle_ribbon", "Toggle Ribbon")
        .separator()
        .text("zoom_in", "Zoom In")
        .text("zoom_out", "Zoom Out")
        .text("zoom_reset", "Actual Size")
        .separator()
        .item(&dark_toggle)
        .build()?;

    // ── Insert ──────────────────────────────────────────────────────
    let insert_submenu = SubmenuBuilder::new(app, "Insert")
        .text("insert-image", "Image from Disk…")
        .text("sos:table", "Table…")
        .text("insertHorizontalRule", "Horizontal Rule")
        .text("createLink", "Link…")
        .build()?;

    // ── Help ────────────────────────────────────────────────────────
    let help_submenu = SubmenuBuilder::new(app, "Help")
        .text("shortcuts_help", "Keyboard Shortcuts")
        .text("docs_help", "Simple Office Suite Home")
        .build()?;

    let mut menu = MenuBuilder::new(app);
    if is_mac {
        menu = menu.item(&app_submenu);
    }
    let menu = menu
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&insert_submenu)
        .item(&help_submenu)
        .build()?;

    app.set_menu(menu)?;

    // Forward menu events into the webview.
    let handle = app.clone();
    app.on_menu_event(move |_app, event| {
        let _ = handle.emit("sos://menu", event.id().as_ref());
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            pick_image_dialog,
            save_file_dialog,
            write_text_file,
            read_text_file,
            ensure_workspace_dir,
            system_info,
            system_cleanup
        ])
        .setup(|app| {
            #[cfg(desktop)]
            build_menu(&app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Simple Office Suite");
}

#[cfg(desktop)]
mod test {
    use super::*;
    #[test]
    fn menu_builds() {
        // Menu construction is verified in integration tests via the full build;
        // here we only confirm the function signature compiles.
        let _ = build_menu::<tauri::Wry>;
    }
}
