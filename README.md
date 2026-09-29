# Simple Office Suite (SOS)

**A complete, offline-first, Google Workspace–style office suite that lives entirely on your machine.**

Documents · Spreadsheets · Presentations · Forms · Notes · Calendar — zero cloud, zero accounts, zero telemetry. MIT licensed.

<p align="center">
  <img src="public/logo.svg" width="96" alt="Simple Office Suite logo" />
</p>

---

## ✨ Features

| Module | What you get |
|---|---|
| 🏠 **Home (Drive)** | Template gallery, search, list/grid views, star, recolor, trash/restore, recents |
| 🎀 **Ribbon UI** | Office-style tabbed function ribbon in every editor — context tabs per module, collapsible, grouped commands |
| 📄 **Docs** | Rich text WYSIWYG editor with Home (undo/redo, font styles, colors, lists, alignment) and Insert (tables, links, rules) ribbon tabs, A4 page canvas, auto-save, word count, PDF/Markdown/plaintext export |
| 📊 **Sheets** | Virtualized grid, ribbon quick-functions (`Σ SUM`, `x̄ AVG`, `COUNT`, `MIN`, `MAX` one-click wraps), full Formulas tab (math + logic + text), Go-to-cell navigation, CSV import/export, multi-tab workbooks, live SUM/COUNT/AVG stats, **floating charts** (bar / line / pie over any range) and **full undo/redo** (⌘Z / ⌘Y) across cell edits, sorts, fills, row/column and tab operations |

#### Formula engine

Cross-sheet references (`=Sheet2!A1`, `=SUM(Data!A1:A3)`), **named ranges** (`=SUM(Sales)` — manage via Data ▸ Named ranges…), lookups (**VLOOKUP / HLOOKUP / INDEX / MATCH**), SUMPRODUCT, COUNTBLANK, `$`-anchored refs, `&` concatenation, postfix `%`, TRUE/FALSE literals, and ~30 functions with error values (`#REF!`, `#N/A`, `#DIV/0!`, `#NAME?`) — all covered by unit tests (`npm test`).
| 🖼️ **Slides** | 16:9 canvas, ribbon block insertion (title/text/shape/code/image), arrange (front/back), Design tab with background palette, deck sidebar, **fullscreen presenter view with stopwatch & speaker notes** |
| 📝 **Forms** | Question builder (short/paragraph/multiple-choice/checkbox/linear scale), live preview, response tallying with bar charts |
| 🗒️ **Keep** | Colored notes, pinning, checklists, search |
| 📅 **Calendar** | Month grid, event create/edit/delete, color coding, today highlight |
| ⌨️ **Everywhere** | Command palette (`Ctrl/Cmd+K`), dark mode, debounced auto-save, status bar with system telemetry |

Everything is stored **locally** — browser `localStorage` in dev, and native disk persistence via the Rust layer in the packaged app (`.sos` JSON snapshots, CSV/MD/HTML exports).

## 🔄 Import & Export

All conversion runs locally in the browser/webview — no file ever leaves your machine.

| Module | Import | Export |
|---|---|---|
| 📄 **Docs** | `.docx` · `.odt` · `.rtf` · `.md` · `.html` · `.txt` | `.docx` · `.odt` · `.pdf` · `.html` · `.md` · `.txt` |
| 📊 **Sheets** | `.xlsx` · `.ods` · `.csv` · `.tsv` · `.json` | `.xlsx` · `.ods` · `.csv` · `.tsv` · `.json` |
| 🖼️ **Slides** | `.json` (SOS deck) · `.html` (deck export) | `.html` (self-running deck) · `.json` · `.pdf` |

`File → Import file…` and `File → Download…` in every editor open the same transfer dialog. The conversion engine (`src/lib/converters.ts` + a dependency-free ZIP writer) is covered by round-trip unit tests — `npm test`.

## 🏗 Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Tauri Window                           │
│                                                                │
│  ┌────────────────────── Svelte + TS + Vite ────────────────┐  │
│  │  App.svelte                                              │  │
││  ├── Header (compact module tabs, file actions)          │  │
│  │    ├── Rail   (compact Drive-style nav, recents)         │  │
│  │    ├── Ribbon  (per-module tabs: Home/Insert/Formulas…)  │  │
│  │    ├── StatusBar (metrics, memory, autosave state)       │  │
│  │    └── CommandPalette (Ctrl/Cmd+K)                       │  │
│  │                                                          │  │
│  │  Modules           Shared engines                        │  │
│  │  ├─ Home           ├─ state.ts     (local Drive store)   │  │
│  │  ├─ Writer         ├─ formula.ts   (parser/evaluator)    │  │
│  │  ├─ Sheets         ├─ utils.ts     (md/csv/pdf helpers)  │  │
│  │  ├─ Slides         ├─ tauri.ts     (IPC + fallbacks)     │  │
│  │  ├─ Forms          └─ types.ts                           │  │
│  │  ├─ Keep                                                 │  │
│  │  └─ Calendar                                             │  │
│  └──────────────────────────┬─────────────────────────────-─┘  │
│                             │ invoke()                         │
│  ┌──────────────────────────▼─────────────────────────────-──┐  │
│  │                    Rust core (src-tauri)                  │  │
│  │  open_file_dialog · save_file_dialog · write_text_file    │  │
│  │  read_text_file · ensure_workspace_dir · system_info      │  │
│  │  Plugins: dialog · fs · opener                            │  │
│  └──────────────────────────┬─────────────────────────────-──┘  │
└─────────────────────────────┼──────────────────────────────────-┘
                              │
                    💾 Local file system
              (Documents/Simple Office Suite/, user-chosen paths)
```

**Design principles**

1. **Offline-first, always** — every feature works with networking disabled. The browser build is a fully functional fallback; Tauri only adds native dialogs and disk I/O.
2. **Thin native layer** — Rust does nothing but sandboxed FS + OS plumbing. All product logic is reviewable TypeScript.
3. **Open formats** — native state is JSON; exports are standard Markdown, CSV, HTML, PDF. No lock-in.
4. **One compact shell** — a single window hosts all modules behind shared chrome (header, rail, status bar) and one data-driven ribbon component; editors differ only by their tab definitions.
5. **Small & fast** — no heavyweight editor frameworks; the whole frontend is Svelte + hand-rolled engines. Shipped macOS `.app`: **3.9 MB**.

## 🚀 Getting started

### Install (end users — no toolchain, no drivers)

Download an installer from [Releases](https://github.com/edgemad/sos/releases) — everything the app needs ships inside the bundle. Tauri apps use the system's built-in web engine, so there are **no extra runtime drivers or runtimes to install**.

| Platform | Download | Notes |
|---|---|---|
| **Windows 10/11** | `…_x64-setup.exe` | Per-user install — **no admin rights, no UAC prompt**. WebView2 ships with Windows 10/11; on the rare machine without it, the installer fetches it automatically. An `.msi` is also available for managed deployments. |
| **macOS 10.15+** | `…_aarch64.dmg` (Apple Silicon) / `…_x64.dmg` (Intel) | Right-click ▸ Open on first launch (unsigned builds). WebKit is part of macOS. |
| **Ubuntu / Debian** | `…_amd64.deb` | `sudo dpkg -i *.deb && sudo apt -f install` pulls 3–4 standard WebKitGTK libraries (no PPA, no external repo). |
| **Fedora / openSUSE** | `…_x86_64.rpm` | Same engine libraries via your package manager. |
| **Any Linux distro** | `…_amd64.AppImage` | **Zero install**: `chmod +x` and run. Bundles everything, works on glibc distros, ideal for locked-down machines. |
| **Android 8+** | `…_aarch64.apk` | Sideload: enable "Install unknown apps" for your browser. The webview engine is part of Android itself. |

Offline-first means no accounts, no sign-in, and no network checks at install or run time.

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [Rust](https://rustup.rs) ≥ 1.77
- Platform deps for Tauri ([guide](https://tauri.app/start/prerequisites/)):
  - **macOS** — Xcode CLT (`xcode-select --install`)
  - **Linux (Debian/Ubuntu)** — `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **Linux (Fedora)** — `sudo dnf install webkit2gtk4.1-devel gcc gcc-c++`
  - **Linux (Arch)** — `sudo pacman -S webkit2gtk-4.1 base-devel`
  - **Windows** — Visual Studio Build Tools + WebView2 (preinstalled on Win 10/11)

### Develop

```bash
npm install

# Frontend only (fast iteration, runs in your browser)
npm run dev

# Full desktop app with hot reload
npm run tauri:dev
```

### Build production bundles

```bash
npm run tauri:build
```

Outputs:

| OS | Artifacts |
|---|---|
| macOS (Apple Silicon + Intel) | `.dmg`, `.app` |
| Linux | `.AppImage`, `.deb`, `.rpm` |
| Windows | `.msi` (WiX), NSIS `.exe` |

### Type checking

```bash
npm run check      # svelte-check
cd src-tauri && cargo check
```

## 📁 Project layout

```
simple-office-suite/
├── .github/workflows/     # ci.yml + release.yml (3-OS builds)
├── public/                # logo.svg
├── src/
│   ├── components/
│   │   ├── layout/        # Header, Rail, StatusBar, CommandPalette
│   │   ├── home/          # Drive-style launcher
│   │   ├── writer/        # toolbar + paginated A4 canvas
│   │   ├── sheets/        # virtualized grid + formula engine
│   │   ├── slides/        # canvas, deck sidebar, presenter modal
│   │   ├── forms/         # builder, preview, responses
│   │   ├── keep/          # sticky notes
│   │   └── calendar/      # month grid + events
│   ├── lib/               # state.ts, formula.ts, tauri.ts, utils.ts
│   ├── types/             # domain models
│   ├── app.css            # Tailwind layers + editor styles
│   ├── App.svelte
│   └── main.ts
├── src-tauri/
│   ├── capabilities/      # Tauri 2 permission manifest
│   ├── src/               # lib.rs (IPC commands), main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## 📤 Exports & formats

| From | To |
|---|---|
| Docs | PDF (print pipeline), Markdown, plaintext, `.sos` JSON |
| Sheets | CSV, `.sos` JSON, workbook JSON |
| Slides | PDF handout (print pipeline), `.sos` JSON |
| Forms / Keep / Calendar | `.sos` JSON |

`.sos` files are plain JSON — diff-friendly and trivially importable anywhere.

## 🗺 Roadmap

- [ ] Real `.docx` / `.xlsx` / `.pptx` round-tripping (docx-rs + calamine on the Rust side)
- [ ] Collaborative-style local comments & suggestions in Docs
- [ ] Sheets: conditional formatting (floating charts shipped in v1.2.0)
- [ ] Slides: image blocks from local disk, transitions
- [ ] Optional offline "account" — encrypted local profiles

## 🤝 Contributing

1. Fork & create a branch: `git checkout -b feat/my-feature`
2. Make your change; keep it dependency-light.
3. Run `npm run check` and `cargo check` — both must pass.
4. Format: Prettier defaults for TS/Svelte, `cargo fmt` for Rust.
5. Open a PR with a clear description; one feature per PR.

Good first issues: formula functions, exporter polish, accessibility passes, platform-specific QA.

## 📄 License

[MIT](./LICENSE) © Simple Office Suite Contributors
