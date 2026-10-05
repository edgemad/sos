<script lang="ts">
  // Status bar: contextual metrics per module + system telemetry.
  import { onMount } from "svelte";
  import { activeModule, openFile, saveStatus } from "../../lib/state";
  import { systemInfo, isTauri } from "../../lib/tauri";
  import type { SystemInfoPayload } from "../../lib/tauri";
  import { countWords, htmlToText } from "../../lib/utils";
  import { isSpeaking, isListening, stopSpeaking } from "../../lib/voice";

  let info: SystemInfoPayload | null = null;

  onMount(async () => {
    if (isTauri()) info = await systemInfo();
  });

  $: file = $openFile;
  $: words = file && file.kind === "document" ? countWords(docHtml) : 0;
  $: chars = file && file.kind === "document" ? htmlToText(docHtml).length : 0;
  $: docHtml = file && file.kind === "document" ? (file.content as { html: string }).html : "";
  $: slideCount = file && file.kind === "deck" ? (file.content as { slides: unknown[] }).slides?.length ?? 0 : 0;
  $: formStats = file && file.kind === "form"
    ? {
        q: (file.content as { questions: unknown[] }).questions?.length ?? 0,
        r: (file.content as { responses?: unknown[] }).responses?.length ?? 0
      }
    : { q: 0, r: 0 };

  function cellsUsed(content: unknown): number {
    const c = content as { sheets?: { cells: Record<string, string> }[]; activeSheet?: number };
    if (!c?.sheets) return 0;
    const tab = c.sheets[c.activeSheet ?? 0];
    return tab ? Object.keys(tab.cells).filter((k) => tab.cells[k] !== "").length : 0;
  }

  const moduleHint: Record<string, string> = {
    home: "All your files, stored locally",
    writer: "Docs — offline word processor",
    sheets: "Sheets — offline spreadsheet",
    slides: "Slides — offline presentations",
    forms: "Forms — offline surveys",
    notes: "Notes — notes & checklists",
    calendar: "Calendar — offline schedule"
  };
</script>

<footer class="h-7 shrink-0 flex items-center gap-4 px-3 text-xs text-gray-500 dark:text-gray-400 glass-bar border-t border-white/40 dark:border-white/10">
  <span>{moduleHint[$activeModule] ?? ""}</span>
  {#if $isListening}
    <span class="!text-docs font-medium animate-pulse" title="Voice typing is active">🎙 Listening</span>
  {/if}
  {#if $isSpeaking}
    <button class="!text-docs font-medium hover:underline" title="Reading aloud — click to stop" on:click={() => stopSpeaking()}>🔊 Speaking</button>
  {/if}
  <span class="flex-1" />
  {#if file?.kind === "document"}
    <span>{words} words</span>
    <span>{chars} chars</span>
  {:else if file?.kind === "spreadsheet"}
    <span>{cellsUsed(file.content)} cells used</span>
  {:else if file?.kind === "deck"}
    <span>{slideCount} slides</span>
  {:else if file?.kind === "form"}
    <span>{formStats.q} questions · {formStats.r} responses</span>
  {/if}
  <span class="flex-1" />
  {#if info}
    <span title="App memory usage">{info.used_memory_mb} MB</span>
    <span>{info.os_name} {info.os_version}</span>
  {:else}
    <span>Browser mode (no native FS)</span>
  {/if}
  <span>{$saveStatus === "saving" ? "Saving…" : "Saved"}</span>
</footer>
