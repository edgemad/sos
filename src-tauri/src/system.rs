use serde::Serialize;
use std::fs;
use std::path::PathBuf;

use tauri::Manager;

/// Human-readable outcome of a system action.
#[derive(Debug, Clone, Serialize)]
pub struct SystemResult {
    pub ok: bool,
    pub action: String,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u64>,
}

impl SystemResult {
    pub fn success(action: &str, detail: impl Into<String>, count: u64) -> Self {
        Self {
            ok: true,
            action: action.to_string(),
            detail: detail.into(),
            count: Some(count),
        }
    }

    pub fn failed(action: &str, detail: impl Into<String>) -> Self {
        Self {
            ok: false,
            action: action.to_string(),
            detail: detail.into(),
            count: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchQuery {
    pub base: String,
    pub pattern: String,
    pub recursive: bool,
}

impl SearchQuery {
    pub fn parse(app: &tauri::AppHandle, action: String) -> Result<Self, String> {
        let args: serde_json::Value =
            serde_json::from_str(&action).map_err(|e| format!("bad find payload: {e}"))?;
        let base = args["base"]
            .as_str()
            .ok_or("find requires a `base` field")?;
        let pattern = args["pattern"]
            .as_str()
            .ok_or("find requires a `pattern` field")?
            .to_string();
        let recursive = args["recursive"].as_bool().unwrap_or(true);

        let root = match base {
            "downloads" => dirs::download_dir().ok_or("downloads dir not found")?,
            "desktop" => dirs::desktop_dir().ok_or("desktop dir not found")?,
            "documents" => dirs::document_dir().ok_or("documents dir not found")?,
            "pictures" => dirs::picture_dir().ok_or("pictures dir not found")?,
            "home" => {
                let h = dirs::home_dir().ok_or("home dir not found")?;
                let allowed = ["Downloads", "Desktop", "Documents", "Pictures"];
                let mut found = None;
                for d in allowed {
                    let p = h.join(d);
                    if p.is_dir() {
                        found = Some(p);
                        break;
                    }
                }
                found.ok_or("no whitelisted subdirectory inside home")?
            }
            _ => return Err(format!("unknown find base: {base:?}")),
        };
        Ok(Self {
            base: base.to_string(),
            pattern,
            recursive,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Candidate {
    pub label: String,
    pub path: String,
    pub kind: String,
    pub deleted: u64,
    pub freed: u64,
}

pub async fn clear_temp(app: tauri::AppHandle) -> SystemResult {
    let root = std::env::temp_dir();
    let age_hours = 12;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let cutoff = now.saturating_sub(age_hours * 3600);
    let mut freed = 0u64;
    let mut scanned = 0u64;

    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            scanned += 1;
            let mtime = match fs::metadata(&path) {
                Ok(m) => m
                    .modified()
                    .map(|t| {
                        t.duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0)
                    })
                    .unwrap_or(0),
                Err(_) => continue,
            };
            if mtime >= cutoff {
                continue;
            }
            if fs::remove_dir_all(&path).is_err() {
                return SystemResult::failed(
                    "temp_clear",
                    format!("cannot remove {}", path.display()),
                );
            }
            freed += 1;
        }
    }

    SystemResult::success(
        "temp_clear",
        format!("scanned {scanned} temp dir, freed {freed} old folders (older than {age_hours}h)"),
        freed,
    )
}

pub async fn clear_cache(app: tauri::AppHandle) -> SystemResult {
    let roots: Vec<PathBuf> = vec![
        dirs::data_local_dir()
            .map(|p| p.join("cache"))
            .unwrap_or_else(|| PathBuf::new()),
        dirs::home_dir()
            .map(|p| p.join(".cache"))
            .unwrap_or_else(|| PathBuf::new()),
        dirs::home_dir()
            .map(|p| p.join(".local/share"))
            .unwrap_or_else(|| PathBuf::new()),
    ];

    let mut freed = 0u64;
    let mut scanned = 0u64;

    for root in &roots {
        if !root.is_dir() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                if path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .map_or(true, |n| n.starts_with('.'))
                {
                    continue;
                }
                scanned += 1;
                if fs::remove_dir_all(&path).is_err() {
                    return SystemResult::failed(
                        "cache_clear",
                        format!("cannot remove {}", path.display()),
                    );
                }
                freed += 1;
            }
        }
    }

    SystemResult::success(
        "cache_clear",
        format!("scanned {scanned} cache/state dirs, freed {freed}"),
        freed,
    )
}

pub async fn trash_items(app: tauri::AppHandle) -> SystemResult {
    let roots: Vec<PathBuf> = vec![
        dirs::home_dir().unwrap_or_else(|| PathBuf::new()),
        dirs::data_local_dir().unwrap_or_else(|| PathBuf::new()),
        std::env::temp_dir(),
    ];

    let mut found = Vec::new();
    for root in &roots {
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    found.push(Candidate {
                        label: path
                            .file_name()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default(),
                        path: path.to_string_lossy().to_string(),
                        kind: "dir".into(),
                        deleted: 0,
                        freed: 0,
                    });
                }
            }
        }
    }

    SystemResult::success(
        "trash_foreach",
        "scanned roots for candidate items",
        found.len() as u64,
    )
}

#[cfg(target_os = "macos")]
pub async fn empty_trash(app: tauri::AppHandle) -> SystemResult {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::new());
    let trash = home.join(".Trashes");
    if !trash.is_dir() {
        return SystemResult::success("trash_empty", "No Trash found on this machine", 0);
    }
    let mut freed = 0u64;
    if let Ok(entries) = fs::read_dir(&trash) {
        for entry in entries.filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.is_dir() {
                if fs::remove_dir_all(&p).is_err() {
                    return SystemResult::failed(
                        "trash_empty",
                        format!("cannot remove {}", p.display()),
                    );
                }
                freed += 1;
            }
        }
    }
    SystemResult::success(
        "trash_empty",
        format!("removed {freed} item(s) from .Trashes"),
        freed,
    )
}

#[cfg(not(target_os = "macos"))]
pub async fn empty_trash_unix(app: tauri::AppHandle) -> SystemResult {
    SystemResult::success("trash_empty", "Trash management is macOS-only", 0)
}

pub async fn recall_trash(app: tauri::AppHandle) -> SystemResult {
    empty_trash(app).await
}

#[cfg(not(target_os = "macos"))]
pub async fn empty_trash_unix(app: tauri::AppHandle) -> SystemResult {
    SystemResult::success("trash_empty", "Trash management is macOS-only", 0)
}

pub async fn trash_recall_paths(app: tauri::AppHandle, rel: String) -> SystemResult {
    let root = match dirs::home_dir() {
        Some(p) => p,
        None => return SystemResult::failed("trash_recall", "home dir unavailable"),
    };
    let p = root.join(&rel);
    if !p.is_dir() {
        return SystemResult::success("trash_recall", format!("{} not found", rel), 0);
    }
    if fs::remove_dir_all(&p).is_err() {
        return SystemResult::failed("trash_recall", format!("cannot remove {}", p.display()));
    }
    SystemResult::success("trash_recall", format!("{} removed", rel), 1)
}

pub async fn temp_recall_paths(app: tauri::AppHandle, rel: String) -> SystemResult {
    let root = match dirs::home_dir() {
        Some(p) => p,
        None => return SystemResult::failed("temp_recall", "home dir unavailable"),
    };
    let p = root.join(&rel);
    if !p.is_dir() {
        return SystemResult::success("temp_recall", format!("{} not found", rel), 0);
    }
    if fs::remove_dir_all(&p).is_err() {
        return SystemResult::failed("temp_recall", format!("cannot remove {}", p.display()));
    }
    SystemResult::success("temp_recall", format!("{} removed", rel), 1)
}

pub async fn find_files(app: tauri::AppHandle, q: SearchQuery) -> SystemResult {
    let root = match q.base.as_str() {
        "downloads" => match dirs::download_dir() {
            Some(p) => p,
            None => return SystemResult::failed("find_files", "downloads dir not found"),
        },
        "desktop" => match dirs::desktop_dir() {
            Some(p) => p,
            None => return SystemResult::failed("find_files", "desktop dir not found"),
        },
        "documents" => match dirs::document_dir() {
            Some(p) => p,
            None => return SystemResult::failed("find_files", "documents dir not found"),
        },
        "pictures" => match dirs::picture_dir() {
            Some(p) => p,
            None => return SystemResult::failed("find_files", "pictures dir not found"),
        },
        "home" => {
            let h = match dirs::home_dir() {
                Some(p) => p,
                None => return SystemResult::failed("find_files", "home dir not found"),
            };
            let allowed = ["Downloads", "Desktop", "Documents", "Pictures"];
            let mut found = None;
            for d in allowed {
                let p = h.join(d);
                if p.is_dir() {
                    found = Some(p);
                    break;
                }
            }
            match found {
                Some(p) => p,
                None => {
                    return SystemResult::failed(
                        "find_files",
                        "no whitelisted subdirectory inside home",
                    )
                }
            }
        }
        _ => return SystemResult::failed("find_files", format!("unknown base: {q:?}")),
    };

    let pattern = q.pattern;
    let mut matches = Vec::new();

    fn walk(
        dir: &std::path::Path,
        pattern: &str,
        recursive: bool,
        matches: &mut Vec<String>,
    ) -> Result<(), String> {
        if !dir.is_dir() {
            return Ok(());
        }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let p = entry.path();
                if p.is_dir() {
                    if recursive {
                        walk(&p, pattern, recursive, matches)?;
                    }
                } else if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                    if name.to_lowercase().contains(&pattern.to_lowercase()) {
                        matches.push(p.to_string_lossy().to_string());
                    }
                }
            }
        }
        Ok(())
    }

    if let Err(e) = walk(&root, &pattern, q.recursive, &mut matches) {
        return SystemResult::failed("find_files", e);
    }

    SystemResult::success(
        "find_files",
        format!("found {} match(es) under {}", matches.len(), root.display()),
        matches.len() as u64,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidate_serializes() {
        let c = Candidate {
            label: "foo".into(),
            path: "/tmp/foo".into(),
            kind: "dir".into(),
            deleted: 1,
            freed: 2,
        };
        let s = serde_json::to_string(&c).unwrap();
        assert!(s.contains("foo"));
        assert!(s.contains("dir"));
    }
}
