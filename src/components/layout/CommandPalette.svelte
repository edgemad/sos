<script lang="ts">
  // Ctrl/Cmd+K command palette: navigate, create, open files.
  import { get } from "svelte/store";
  import { rankIds, recordCommand, usage, type UsageMap } from "../../lib/adaptive";
  import { paletteOpen, fileMetas, createFile, openInEditor, activeModule, openFile } from "../../lib/state";
  import { settings } from "../../lib/settings";
  import { toast } from "../../lib/uiBridge";
  import { speakTalia, stopSpeaking, isSpeechSynthesisSupported } from "../../lib/voice";
  import { htmlToText } from "../../lib/utils";
  import type { ModuleId, SosFileMeta } from "../../types";

  interface Cmd {
    id: string;
    label: string;
    hint: string;
    run: () => void;
  }

  let query = "";
  let selectedIndex = 0;

  $: commands = buildCommands($fileMetas, query, $settings.voiceEnabled, $usage);
  $: if ($paletteOpen) {
    query = "";
    selectedIndex = 0;
  }
  $: if (commands) selectedIndex = Math.min(selectedIndex, Math.max(0, commands.length - 1));

  function buildCommands(metas: SosFileMeta[], q: string, voiceEnabled: boolean, usageMap: UsageMap): Cmd[] {
    const cmds: Cmd[] = [];
    const nav: { m: ModuleId; label: string; icon: string }[] = [
      { m: "home", label: "Go to Home", icon: "🏠" },
      { m: "writer", label: "Go to Docs", icon: "📄" },
      { m: "sheets", label: "Go to Sheets", icon: "📊" },
      { m: "slides", label: "Go to Slides", icon: "🖼️" },
      { m: "forms", label: "Go to Forms", icon: "📝" },
      { m: "notes", label: "Go to Notes", icon: "🗒️" },
      { m: "calendar", label: "Go to Calendar", icon: "📅" },
      { m: "arcade", label: "Go to Arcade", icon: "🕹️" }
    ];
    for (const n of nav) {
      if (matches(n.label, q))
        cmds.push({ id: "nav-" + n.m, label: n.label, hint: "Navigation", run: () => activeModule.set(n.m) });
    }
    const create: { kind: import("../../types").DocKind; label: string; icon: string }[] = [
      { kind: "document", label: "New document", icon: "📄" },
      { kind: "spreadsheet", label: "New spreadsheet", icon: "📊" },
      { kind: "deck", label: "New presentation", icon: "🖼️" },
      { kind: "form", label: "New form", icon: "📝" }
    ];
    for (const c of create) {
      if (matches(c.label, q))
        cmds.push({ id: "new-" + c.kind, label: c.label, hint: "Create", run: () => createFile(c.kind) });
    }
    const voice: Cmd[] = [
      { id: "voice-read", label: "Read document aloud", hint: "Voice", run: readAloud },
      { id: "voice-stop", label: "Stop reading aloud", hint: "Voice", run: () => { stopSpeaking(); toast("Stopped reading aloud."); } },
      {
        id: "voice-toggle",
        label: voiceEnabled ? "Turn voice features off" : "Turn voice features on",
        hint: "Voice",
        run: () => {
          settings.update((s) => ({ ...s, voiceEnabled: !s.voiceEnabled }));
          toast(voiceEnabled ? "Voice features off" : "Voice features on");
        }
      },
      { id: "insert-image", label: "Insert image (in the open doc)", hint: "Docs", run: () => void writerCmd("insert:image") },
      { id: "insert-attachment", label: "Attach file (in the open doc)", hint: "Docs", run: () => void writerCmd("insert:attachment") }
    ];
    for (const c of voice) {
      if (matches(c.label, q)) cmds.push(c);
    }
    for (const f of metas.filter((f) => !f.trashed)) {
      if (matches(f.name, q))
        cmds.push({
          id: "open-" + f.id,
          label: `Open: ${f.name}`,
          hint: f.kind,
          run: () => openInEditor(f.id)
        });
    }
    // Self-learning: rank by how often/recently you actually use commands,
    // then cap the list (nav + create + voice + files fit in 16).
    const byId = new Map(cmds.map((c) => [c.id, c] as const));
    return rankIds(usageMap, cmds.map((c) => c.id), Date.now())
      .map((id) => byId.get(id))
      .filter((c): c is Cmd => !!c)
      .slice(0, 16);
  }

  function matches(text: string, q: string): boolean {
    return !q || text.toLowerCase().includes(q.toLowerCase());
  }

  /** Forward a Docs command to the open Writer via its event bridge
   *  (no-ops with a toast when no document is open). */
  async function writerCmd(cmd: string): Promise<void> {
    const f = get(openFile);
    if (f?.kind !== "document") {
      toast("Open a document first — images and attachments live in Docs.");
      return;
    }
    window.dispatchEvent(new CustomEvent("sos-cmd-writer", { detail: { cmd } }));
  }

  /** Record usage (self-learning) and run the command. */
  function runCommand(cmd: Cmd | undefined): void {
    if (!cmd) return;
    recordCommand(cmd.id);
    cmd.run();
  }

  /** Read the open document (or current selection) aloud via speech synthesis. */
  function readAloud(): void {
    const s = get(settings);
    if (!s.voiceEnabled) {
      toast("Voice is turned off — enable it in Settings.");
      return;
    }
    if (!isSpeechSynthesisSupported()) {
      toast("Speech synthesis is not available in this environment.");
      return;
    }
    const f = get(openFile);
    if (f?.kind !== "document") {
      toast("Open a document first — read aloud works in Docs.");
      return;
    }
    const html = (f.content as { html: string }).html;
    const sel = window.getSelection()?.toString().trim();
    const text = sel || htmlToText(html);
    if (!text.trim()) {
      toast("Nothing to read — the document is empty.");
      return;
    }
    const ok = speakTalia(text, s);
    toast(ok ? "Reading the document aloud…" : "Speech synthesis is unavailable on this device.");
  }

  function close(): void {
    paletteOpen.set(false);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, commands.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      runCommand(commands[selectedIndex]);
      close();
    }
  }
</script>

{#if $paletteOpen}
  <div class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-start justify-center pt-[12vh]" on:click|self={close}>
    <div class="w-[560px] max-w-[92vw] glass-strong rounded-xl overflow-hidden" on:click|stopPropagation>
      <input
        class="w-full h-12 px-4 text-base bg-transparent outline-none border-b border-gray-200 dark:border-gray-700"
        placeholder="Type a command or search files…"
        bind:value={query}
        on:keydown={onKeydown}
      />
      <div class="max-h-[320px] overflow-y-auto py-1">
        {#each commands as cmd, i (cmd.id)}
          <button
            class="menu-item !items-center {i === selectedIndex ? 'bg-white/60 dark:bg-white/10' : ''}"
            on:mouseover={() => (selectedIndex = i)}
            on:click={() => { runCommand(cmd); close(); }}
          >
            <span class="flex-1 truncate">{cmd.label}</span>
            <span class="text-xs text-gray-400">{cmd.hint}</span>
          </button>
        {/each}
        {#if commands.length === 0}
          <p class="px-4 py-6 text-sm text-gray-400 text-center">No matching commands</p>
        {/if}
      </div>
      <div class="px-4 py-2 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700 flex gap-3">
        <span>↑↓ navigate</span><span>⏎ run</span><span>esc close</span>
      </div>
    </div>
  </div>
{/if}
