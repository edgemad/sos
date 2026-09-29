<script lang="ts">
  import { onMount } from "svelte";
  import { activeModule, activeFileId, openFile, paletteOpen, createFile, updateContent, renameFile, darkMode } from "./lib/state";
  import { get } from "svelte/store";
  import { installShortcutListener, matches, modLabel } from "./lib/shortcuts";
  import { onNativeMenu } from "./lib/menuBridge";
  import { exportPdf, toCsv } from "./lib/utils";
  import { evaluateCell, displayValue, colToName } from "./lib/formula";
  import { saveFileDialog, writeFile } from "./lib/tauri";
  import { registerAskHost, resolveAsk, type AskRequest, registerToastHost, toast, flushPendingToasts, type ToastMsg } from "./lib/uiBridge";
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

  // Liquid Glass: tint the whole chrome with the active module's accent.
  const moduleAccent: Record<ModuleId, string> = {
    home: "#1a73e8",
    writer: "#1a73e8",
    sheets: "#0f9d58",
    slides: "#f4b400",
    forms: "#7248b9",
    keep: "#fbbc04",
    calendar: "#1967d2"
  };
  $: if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--sos-accent", moduleAccent[mod] ?? "#1a73e8");
  }

  let settingsOpen = false;
  let findOpen = false;

  function handleNew(kind: DocKind): void {
    createFile(kind);
  }

  // ── Save current file to disk as .sos ───────────────────────────

  async function saveCurrentToDisk(): Promise<void> {
    const file = get(openFile);
    if (!file) return;
    try {
      const payload = JSON.stringify(file, null, 2);
      const lastPath = (file.content as { __path?: string }).__path;
      if (lastPath) {
        const ok = await writeFile(lastPath, payload);
        if (ok) toast("Saved to disk");
        else toast("Could not write the file — is it still at " + lastPath + "?");
      } else {
        const p = await saveFileDialog(`${file.name.replace(/[\\/:*?"<>|]/g, "_")}.sos`, payload);
        if (p) {
          updateContent(file.id, { ...(file.content as object), __path: p });
          toast("Saved to " + p);
        }
      }
    } catch (e) {
      console.error("save failed", e);
      toast("Save failed: " + (e instanceof Error ? e.message : String(e)));
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
          row.push(raw && raw.startsWith("=") ? (() => { try { return displayValue(evaluateCell(tab, key, data, data.names)); } catch { return "#ERROR!"; } })() : raw ?? "");
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
      else if (matches(e, "mod+shift+z") || matches(e, "mod+y")) { e.preventDefault(); window.dispatchEvent(new CustomEvent("sos:redo-request")); }
      else if (matches(e, "mod+z")) {
        // Let contenteditable/inputs keep their native undo (Writer, text fields);
        // route everything else to the focused module's history engine.
        const ae = document.activeElement as HTMLElement | null;
        const nativeEditable = !!ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
        if (!nativeEditable) { e.preventDefault(); window.dispatchEvent(new CustomEvent("sos:undo-request")); }
      }
      else if (matches(e, "mod+shift+c")) { e.preventDefault(); window.dispatchEvent(new CustomEvent("sos:wordcount-request")); }
      else if (matches(e, "mod+alt+d")) { e.preventDefault(); darkMode.update((v) => !v); }
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
        case "dark_mode": darkMode.update((v) => !v); break;
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

  // ── Crash recovery (OnlyOffice-style): a window error shows a recovery
  // overlay instead of a white screen; user data lives in storage and survives.
  let crashed: string | null = null;

  // ── App-wide dialog/toast host (see lib/uiBridge.ts) ───────────
  let askReq: AskRequest | null = null;
  let askInputEl: HTMLInputElement | undefined;
  let toasts: ToastMsg[] = [];
  onMount(() => {
    registerAskHost((r) => {
      askReq = r;
      if (r) setTimeout(() => askInputEl?.focus(), 30);
    });
    registerToastHost((t) => (toasts = t));
    // Replay any toasts raised before this host mounted (early startup).
    flushPendingToasts();
  });
  // Transient failures (IPC hiccup, disk full, bad import) surface as toasts,
  // not the crash overlay — OnlyOffice-style: the app keeps running.
  window.addEventListener("unhandledrejection", (e) => {
    e.preventDefault();
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? "Something went wrong");
    console.error("Unhandled rejection:", e.reason);
    toast("⚠️ " + msg);
  });
  function onCrash(e: Event): void {
    crashed = String((e as ErrorEvent).message ?? "unknown error");
    console.error("SOS crash:", e);
  }
  function recover(): void {
    crashed = null;
    window.location.reload();
  }
</script>

<svelte:window on:error={onCrash} />
<!-- Svelte 4's own error boundary: catches render/update errors that never
     reach window.onerror. Invisible; same recovery path as window errors. -->
<span class="hidden" on:error={onCrash} />

<!-- Liquid Glass ambient backdrop: slow aurora blobs behind translucent chrome -->
<div class="sos-ambient" aria-hidden="true">
  <div class="sos-ambient-blob"></div>
</div>

<div class="h-full flex flex-col">
  {#if crashed}
    <div class="fixed inset-0 z-[200] bg-white/70 dark:bg-[#141519]/70 backdrop-blur-xl grid place-items-center p-8">
      <div class="glass-strong max-w-md p-6 text-center rounded-xl">
        <div class="text-4xl mb-3">🛠️</div>
        <h2 class="font-semibold text-lg mb-1">Something went wrong</h2>
        <p class="text-sm text-gray-500 mb-1">Your files are safe — everything is stored locally.</p>
        <p class="text-[11px] font-mono text-gray-400 mb-4 break-all max-h-20 overflow-y-auto">{crashed}</p>
        <div class="flex gap-2 justify-center">
          <button class="btn btn-ghost text-xs" on:click={() => { crashed = null; }}>Dismiss</button>
          <button class="btn btn-primary text-xs" on:click={recover}>Reload app</button>
        </div>
      </div>
    </div>
  {:else}
  <Header onNew={handleNew} on:settings={() => (settingsOpen = true)} />

  <div class="flex-1 flex min-h-0">
    <Rail activeModuleId={mod} />

    <main class="flex-1 min-w-0 flex flex-col overflow-hidden">
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

  {#if askReq}
    <div class="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm grid place-items-center" on:click|self={() => resolveAsk(null)}>
      <div class="glass-strong w-[380px] max-w-[92vw] p-5 rounded-xl" on:click|stopPropagation>
        <h3 class="font-medium mb-3">{askReq.title}</h3>
        {#if askReq.kind === "prompt"}
          <input
            bind:this={askInputEl}
            class="input w-full mb-4"
            placeholder={askReq.placeholder}
            bind:value={askReq.value}
            on:keydown={(e) => { if (e.key === "Enter") resolveAsk(askReq?.value ?? null); if (e.key === "Escape") resolveAsk(null); }}
          />
        {/if}
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost text-xs" on:click={() => resolveAsk(null)}>Cancel</button>
          <button class="btn btn-primary text-xs" on:click={() => resolveAsk(askReq?.kind === "prompt" ? askReq?.value ?? "" : "ok")}>
            {askReq.kind === "prompt" ? "OK" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if toasts.length}
    <div class="fixed bottom-10 left-1/2 -translate-x-1/2 z-[160] flex flex-col gap-2 items-center">
      {#each toasts as t (t.id)}
        <div class="glass-strong !py-2 !px-4 text-sm rounded-full">{t.msg}</div>
      {/each}
    </div>
  {/if}
  {/if}
</div>
