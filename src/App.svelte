<script lang="ts">
  import { onMount } from "svelte";
  import { activeModule, activeFileId, openFile, paletteOpen, createFile, updateContent, renameFile } from "./lib/state";
  import { get } from "svelte/store";
  import { installShortcutListener, matches, modLabel } from "./lib/shortcuts";
  import { onNativeMenu } from "./lib/menuBridge";
  import { exportPdf, toCsv } from "./lib/utils";
  import { evaluateCell, displayValue, colToName } from "./lib/formula";
  import { saveFileDialog, writeFile } from "./lib/tauri";
  import Header from "./components/layout/Header.svelte";
  import Rail from "./components/layout/Rail.svelte";
  import StatusBar from "./components/layout/StatusBar.svelte";
  import EmptyState from "./components/layout/EmptyState.svelte";
  import CommandPalette from "./components/layout/CommandPalette.svelte";
  import SettingsModal from "./components/layout/SettingsModal.svelte";
  import Home from "./components/home/Home.svelte";
  import Writer from "./components/writer/Writer.svelte";
  import Sheets from "./components/sheets/Sheets.svelte";
  import Slides from "./components/slides/Slides.svelte";
  import Forms from "./components/forms/Forms.svelte";
  import Keep from "./components/keep/Keep.svelte";
  import Calendar from "./components/calendar/Calendar.svelte";
  import type { DocKind, ModuleId } from "./types";

  $: mod = $activeModule as ModuleId;
  $: openKind = $openFile?.kind ?? null;
  $: showsWriter = openKind === "document";
  $: showsSheets = openKind === "spreadsheet";
  $: showsSlides = openKind === "deck";

  let settingsOpen = false;
  let findOpen = false;

  function handleNew(kind: DocKind): void {
    createFile(kind);
  }

  // ── Save current file to disk as .sos ───────────────────────────

  async function saveCurrentToDisk(): Promise<void> {
    const file = get(openFile);
    if (!file) return;
    const payload = JSON.stringify(file, null, 2);
    const lastPath = (file.content as { __path?: string }).__path;
    if (lastPath) {
      await writeFile(lastPath, payload);
    } else {
      const p = await saveFileDialog(`${file.name.replace(/[\\/:*?"<>|]/g, "_")}.sos`, payload);
      if (p) updateContent(file.id, { ...(file.content as object), __path: p });
    }
  }

  // ── Export current file as PDF ──────────────────────────────────

  function exportCurrentPdf(): void {
    const file = get(openFile);
    if (!file) return;
    if (file.kind === "document") {
      exportPdf(file.name, `<div class="writer-page">${(file.content as { html: string }).html}</div>`);
    } else if (file.kind === "deck") {
      const deck = file.content as import("./types").Deck;
      const body = deck.slides
        .map((s, i) =>
          `<div style="page-break-after:always;border:1px solid #ddd;padding:24px;margin-bottom:16px">
            <p style="color:#888;font-size:10pt;margin:0 0 8px">Slide ${i + 1}</p>
            ${s.blocks.map((b) => `<div style="font-size:${Math.max(10, b.fontSize / 2.2)}pt;color:${b.color}">${b.text}</div>`).join("")}
          </div>`)
        .join("");
      exportPdf(file.name, body);
    } else if (file.kind === "spreadsheet") {
      const data = file.content as import("./types").SheetData;
      const tab = data.sheets[data.activeSheet];
      const grid: string[][] = [];
      for (let r = 0; r < tab.rows; r++) {
        const row: string[] = [];
        for (let c = 0; c < tab.cols; c++) {
          const key = colToName(c) + (r + 1);
          const raw = tab.cells[key];
          row.push(raw && raw.startsWith("=") ? (() => { try { return displayValue(evaluateCell(tab, key)); } catch { return "#ERROR!"; } })() : raw ?? "");
        }
        grid.push(row);
      }
      void saveFileDialog(`${file.name}.csv`, toCsv(grid));
    }
  }

  // ── Global fallback shortcuts ───────────────────────────────────

  onMount(() => {
    installShortcutListener((e: KeyboardEvent) => {
      if (matches(e, "mod+k")) { e.preventDefault(); paletteOpen.update((v) => !v); }
      else if (matches(e, "mod+,")) { e.preventDefault(); settingsOpen = true; }
      else if (matches(e, "mod+s")) { e.preventDefault(); void saveCurrentToDisk(); }
      else if (matches(e, "mod+p")) { e.preventDefault(); exportCurrentPdf(); }
      else if (matches(e, "mod+o")) { e.preventDefault(); window.dispatchEvent(new CustomEvent("sos:open-request")); }
      else if (matches(e, "mod+shift+c")) { e.preventDefault(); window.dispatchEvent(new CustomEvent("sos:wordcount-request")); }
      else if (matches(e, "mod+alt+d")) { e.preventDefault(); document.documentElement.classList.toggle("dark"); }
      else if (matches(e, "mod+f")) { e.preventDefault(); findOpen = true; window.dispatchEvent(new CustomEvent("sos:find-request")); }
    });

    void onNativeMenu((action) => {
      switch (action) {
        case "settings": settingsOpen = true; break;
        case "new-doc": createFile("document"); break;
        case "new-sheet": createFile("spreadsheet"); break;
        case "new-deck": createFile("deck"); break;
        case "new-form": createFile("form"); break;
        case "new-note": createFile("note"); break;
        case "save": void saveCurrentToDisk(); break;
        case "export-pdf": exportCurrentPdf(); break;
        case "command_palette": paletteOpen.set(true); break;
        case "dark_mode": document.documentElement.classList.toggle("dark"); break;
        case "toggle_sidebar": window.dispatchEvent(new CustomEvent("sos:toggle-sidebar")); break;
        case "toggle_ribbon": window.dispatchEvent(new CustomEvent("sos:toggle-ribbon")); break;
        case "zoom_in": window.dispatchEvent(new CustomEvent("sos:zoom", { detail: 1 })); break;
        case "zoom_out": window.dispatchEvent(new CustomEvent("sos:zoom", { detail: -1 })); break;
        case "zoom_reset": window.dispatchEvent(new CustomEvent("sos:zoom", { detail: 0 })); break;
        case "find": window.dispatchEvent(new CustomEvent("sos:find-request")); break;
        case "open": window.dispatchEvent(new CustomEvent("sos:open-request")); break;
        case "new-doc-from-menu": createFile("document"); break;
        case "insert-image": window.dispatchEvent(new CustomEvent("sos:insert-image")); break;
        case "sos:table": window.dispatchEvent(new CustomEvent("sos:menu-cmd", { detail: "sos:table" })); break;
        case "insertHorizontalRule": window.dispatchEvent(new CustomEvent("sos:menu-cmd", { detail: "insertHorizontalRule" })); break;
        case "createLink": window.dispatchEvent(new CustomEvent("sos:menu-cmd", { detail: "createLink" })); break;
        case "shortcuts_help": window.dispatchEvent(new CustomEvent("sos:show-shortcuts")); break;
        case "check_updates": window.dispatchEvent(new CustomEvent("sos:check-updates")); break;
        case "quit": window.close(); break;
      }
    });
  });

  void renameFile;
  void modLabel;
</script>

<div class="h-full flex flex-col">
  <Header onNew={handleNew} on:settings={() => (settingsOpen = true)} />

  <div class="flex-1 flex min-h-0">
    <Rail activeModuleId={mod} />

    <main class="flex-1 min-w-0 flex flex-col bg-white dark:bg-[#1f1f1f] overflow-hidden">
      {#if mod === "home"}
        <Home />
      {:else if mod === "writer"}
        {#if showsWriter}
          <Writer />
        {:else}
          <EmptyState icon="📄" title="No document open" sub="Pick a doc from Home, or press ＋ New." />
        {/if}
      {:else if mod === "sheets"}
        {#if showsSheets}
          <Sheets />
        {:else}
          <EmptyState icon="📊" title="No spreadsheet open" sub="Open one from Home, or start a fresh grid." />
        {/if}
      {:else if mod === "slides"}
        {#if showsSlides}
          <Slides />
        {:else}
          <EmptyState icon="🖼️" title="No presentation open" sub="Choose a deck from Home, or build a new one." />
        {/if}
      {:else if mod === "forms"}
        <Forms />
      {:else if mod === "keep"}
        <Keep />
      {:else if mod === "calendar"}
        <Calendar />
      {/if}
    </main>

    <CommandPalette />
  </div>

  <StatusBar />

  {#if settingsOpen}
    <SettingsModal on:close={() => (settingsOpen = false)} />
  {/if}
</div>
