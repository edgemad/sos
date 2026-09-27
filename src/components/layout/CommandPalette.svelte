<script lang="ts">
  // Ctrl/Cmd+K command palette: navigate, create, open files.
  import { paletteOpen, fileMetas, createFile, openInEditor, activeModule } from "../../lib/state";
  import type { ModuleId, SosFileMeta } from "../../types";

  interface Cmd {
    id: string;
    label: string;
    hint: string;
    run: () => void;
  }

  let query = "";
  let selectedIndex = 0;

  $: commands = buildCommands($fileMetas, query);
  $: if ($paletteOpen) {
    query = "";
    selectedIndex = 0;
  }
  $: if (commands) selectedIndex = Math.min(selectedIndex, Math.max(0, commands.length - 1));

  function buildCommands(metas: SosFileMeta[], q: string): Cmd[] {
    const cmds: Cmd[] = [];
    const nav: { m: ModuleId; label: string; icon: string }[] = [
      { m: "home", label: "Go to Home", icon: "🏠" },
      { m: "writer", label: "Go to Docs", icon: "📄" },
      { m: "sheets", label: "Go to Sheets", icon: "📊" },
      { m: "slides", label: "Go to Slides", icon: "🖼️" },
      { m: "forms", label: "Go to Forms", icon: "📝" },
      { m: "keep", label: "Go to Keep", icon: "🗒️" },
      { m: "calendar", label: "Go to Calendar", icon: "📅" }
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
    for (const f of metas.filter((f) => !f.trashed)) {
      if (matches(f.name, q))
        cmds.push({
          id: "open-" + f.id,
          label: `Open: ${f.name}`,
          hint: f.kind,
          run: () => openInEditor(f.id)
        });
    }
    return cmds.slice(0, 12);
  }

  function matches(text: string, q: string): boolean {
    return !q || text.toLowerCase().includes(q.toLowerCase());
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
      commands[selectedIndex]?.run();
      close();
    }
  }
</script>

<svelte:window on:keydown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); paletteOpen.update((v) => !v); } }} />

{#if $paletteOpen}
  <div class="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[12vh]" on:click|self={close}>
    <div class="w-[560px] max-w-[92vw] card shadow-modal overflow-hidden" on:click|stopPropagation>
      <input
        class="w-full h-12 px-4 text-base bg-transparent outline-none border-b border-gray-200 dark:border-gray-700"
        placeholder="Type a command or search files…"
        bind:value={query}
        on:keydown={onKeydown}
      />
      <div class="max-h-[320px] overflow-y-auto py-1">
        {#each commands as cmd, i (cmd.id)}
          <button
            class="menu-item !items-center {i === selectedIndex ? 'bg-gray-100 dark:bg-gray-700' : ''}"
            on:mouseover={() => (selectedIndex = i)}
            on:click={() => { cmd.run(); close(); }}
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
