<script lang="ts">
  // Compact global shell: brand, module tabs, per-file actions, exports.
  import { createEventDispatcher } from "svelte";
  import { activeModule, activeFileId, sidebarOpen, openFile, renameFile, trashFile, saveStatus, updateContent } from "../../lib/state";
  import { get } from "svelte/store";
  import { saveFileDialog, writeFile } from "../../lib/tauri";
  import { htmlToMarkdown, exportPdf, htmlToText, toCsv, escapeHtml } from "../../lib/utils";
  import { evaluateCell, displayValue, colToName } from "../../lib/formula";
  import type { ModuleId } from "../../types";

  export let onNew: (kind: import("../../types").DocKind) => void = () => {};

  const tabs: { id: ModuleId; label: string; color: string }[] = [
    { id: "home", label: "Home", color: "#5f6368" },
    { id: "writer", label: "Docs", color: "#1a73e8" },
    { id: "sheets", label: "Sheets", color: "#0f9d58" },
    { id: "slides", label: "Slides", color: "#f4b400" },
    { id: "forms", label: "Forms", color: "#7248b9" },
    { id: "keep", label: "Keep", color: "#fbbc04" },
    { id: "calendar", label: "Calendar", color: "#1967d2" }
  ];

  let menuOpen = false;
  let renaming = false;
  let renameValue = "";

  const dispatch = createEventDispatcher<{ settings: void }>();

  $: file = $openFile;
  $: inEditor = $activeModule !== "home" && file !== null;
  $: docTitle = inEditor && file ? file.name : "Simple Office Suite";

  function startRename(): void {
    if (!file) return;
    renaming = true;
    renameValue = file.name;
  }

  function commitRename(): void {
    if (file && renameValue.trim()) renameFile(file.id, renameValue.trim());
    renaming = false;
  }

  function setModule(m: ModuleId): void {
    activeModule.set(m);
    if (m === "home") activeFileId.set(null);
  }

  // ── Export helpers ──────────────────────────────────────────────

  interface SosFileLike {
    id: string;
    kind: string;
    name: string;
    content: unknown;
  }

  interface SheetTabLike {
    name: string;
    rows: number;
    cols: number;
    cells: Record<string, string>;
  }

  function docHtml(f: SosFileLike): string {
    return (f.content as { html?: string }).html ?? "";
  }

  function deckOf(f: SosFileLike): import("../../types").Deck {
    return f.content as import("../../types").Deck;
  }

  function sheetOf(f: SosFileLike): SheetTabLike {
    const c = f.content as { sheets: SheetTabLike[]; activeSheet: number };
    return c.sheets[c.activeSheet];
  }

  function exportAction(kind: "pdf" | "md" | "txt" | "csv" | "html"): void {
    if (!file) return;
    const base = file.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "document";
    if (kind === "pdf" && file.kind === "document") {
      exportPdf(file.name, `<div class="writer-page">${docHtml(file)}</div>`);
      return;
    }
    if (kind === "pdf" && file.kind === "deck") {
      exportPdf(file.name, renderDeckForPrint(deckOf(file)));
      return;
    }
    if (kind === "csv" && file.kind === "spreadsheet") {
      const grid = materializeGrid(sheetOf(file));
      void saveFileDialog(`${base}.csv`, toCsv(grid));
      return;
    }
    if (kind === "md" && file.kind === "document") {
      void saveFileDialog(`${base}.md`, htmlToMarkdown(docHtml(file)));
      return;
    }
    if (kind === "txt" && file.kind === "document") {
      void saveFileDialog(`${base}.txt`, htmlToText(docHtml(file)));
      return;
    }
    if (kind === "html" && file.kind === "note") {
      const text = (file.content as { text?: string }).text ?? "";
      void saveFileDialog(`${base}.html`, `<h1>${escapeHtml(file.name)}</h1><p>${escapeHtml(text)}</p>`);
      return;
    }
    void saveFileDialog(`${base}.json`, JSON.stringify(file, null, 2));
    menuOpen = false;
  }

  function renderDeckForPrint(deck: import("../../types").Deck): string {
    return deck.slides
      .map(
        (s: import("../../types").Slide, i: number) =>
          `<div style="page-break-after:always;border:1px solid #ddd;padding:24px;margin-bottom:16px;aspect-ratio:16/9">
            <p style="color:#888;font-size:10pt;margin:0 0 8px">Slide ${i + 1}</p>
            ${s.blocks
              .map((b: import("../../types").SlideBlock) =>
                b.type === "code"
                  ? `<pre style="background:#f6f8fa;padding:8px;border-radius:6px"><code>${escapeHtml(b.text)}</code></pre>`
                  : `<div style="font-size:${Math.max(10, b.fontSize / 2.2)}pt;color:${b.color}">${escapeHtml(b.text)}</div>`
              )
              .join("")}
          </div>`
      )
      .join("");
  }

  function materializeGrid(tab: SheetTabLike): string[][] {
    const rows: string[][] = [];
    for (let r = 0; r < tab.rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < tab.cols; c++) {
        const key = colToName(c) + (r + 1);
        row.push(displayOf(tab, key));
      }
      rows.push(row);
    }
    return rows;
  }

  function displayOf(tab: SheetTabLike, key: string): string {
    const raw = tab.cells[key];
    if (raw === undefined || raw === "") return "";
    if (!raw.startsWith("=")) return raw;
    try {
      return displayValue(evaluateCell(tab as never, key));
    } catch {
      return "#ERROR!";
    }
  }

  async function saveToDisk(): Promise<void> {
    if (!file) return;
    const payload = JSON.stringify(file, null, 2);
    const lastPath = (file.content as { __path?: string }).__path;
    if (lastPath) {
      await writeFile(lastPath, payload);
    } else {
      const p = await saveFileDialog(`${file.name.replace(/[\\/:*?"<>|]/g, "_")}.sos`, payload);
      if (p) updateContent(file.id, { ...(file.content as object), __path: p });
    }
    menuOpen = false;
  }
</script>

<header class="h-11 flex items-center gap-2 px-2.5 glass-bar border-b border-white/40 dark:border-white/10 shrink-0">
  <button
    class="btn btn-ghost !px-1.5 !h-7"
    title="Toggle sidebar"
    on:click={() => sidebarOpen.update((v) => !v)}
  >
    <span class="text-base leading-none">☰</span>
  </button>

  <a
    href="#"
    on:click|preventDefault={() => setModule("home")}
    class="flex items-center gap-1.5 pr-1 shrink-0"
    title="Simple Office Suite"
  >
    <img src="/logo.svg" alt="SOS" class="w-6 h-6" />
    <span class="hidden lg:block text-sm font-semibold tracking-tight">SOS</span>
  </a>

  <!-- Module tabs -->
  <nav class="flex items-center gap-0.5 overflow-x-auto">
    {#each tabs as t (t.id)}
      <button
        class="px-2.5 h-7 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer
          text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10
          {$activeModule === t.id ? 'bg-white/60 dark:bg-white/10 shadow-card' : ''}"
        style={$activeModule === t.id ? `color:${t.color};text-shadow:0 0 12px ${t.color}40` : ""}
        on:click={() => setModule(t.id)}
      >
        {t.label}
      </button>
    {/each}
  </nav>

  <div class="flex-1" />

  <!-- Document title + actions -->
  {#if inEditor}
    <div class="flex items-center gap-1.5 min-w-0">
      {#if renaming}
        <input
          class="input w-52 !h-7"
          bind:value={renameValue}
          on:blur={commitRename}
          on:keydown={(e) => e.key === "Enter" && commitRename()}
        />
      {:else}
        <span class="text-sm font-medium truncate max-w-[220px]" title={file?.name}>{docTitle}</span>
        <button class="btn btn-ghost !px-1 !h-7 text-xs" title="Rename" on:click={startRename}>✏️</button>
      {/if}

      <span class="chip glass !text-[10px] !px-2 text-gray-500 dark:text-gray-400">
        {$saveStatus === "saving" ? "Saving…" : "Saved"}
      </span>

      <button class="btn btn-ghost !px-1.5 !h-7 text-sm" title="Settings (Ctrl+,)" on:click={() => dispatch("settings")}>⚙️</button>

      <div class="relative">
        <button class="btn btn-primary !h-7 !px-2.5 text-xs" on:click|stopPropagation={() => (menuOpen = !menuOpen)}>File ▾</button>
        {#if menuOpen}
          <div class="menu right-0 mt-2" role="menu" on:click|stopPropagation>
            <button class="menu-item" on:click={() => { exportAction("pdf"); menuOpen = false; }}>
              🖨️ Export as PDF
            </button>
            {#if file?.kind === "document"}
              <button class="menu-item" on:click={() => { exportAction("md"); menuOpen = false; }}>⬇️ Markdown (.md)</button>
              <button class="menu-item" on:click={() => { exportAction("txt"); menuOpen = false; }}>⬇️ Plaintext (.txt)</button>
            {/if}
            {#if file?.kind === "spreadsheet"}
              <button class="menu-item" on:click={() => { exportAction("csv"); menuOpen = false; }}>⬇️ CSV (.csv)</button>
            {/if}
            <button class="menu-item" on:click={saveToDisk}>
              💾 Save to disk (.sos)
            </button>
            <div class="menu-sep" />
            <button class="menu-item text-red-600 dark:text-red-400" on:click={() => { if (file) trashFile(file.id); menuOpen = false; }}>
              🗑️ Move to trash
            </button>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <button class="btn btn-primary !h-7 !px-2.5 text-xs" on:click={() => onNew("document")}>＋ New</button>
  {/if}
</header>

<style>
  nav {
    scrollbar-width: none;
  }
  nav::-webkit-scrollbar {
    display: none;
  }
</style>
