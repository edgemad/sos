<script lang="ts">
  // Compact left navigation rail.
  import { activeModule, activeFileId, sidebarOpen, fileMetas, openInEditor, createFile } from "../../lib/state";
  import type { ModuleId, SosFileMeta } from "../../types";

  export let activeModuleId: ModuleId;

  const moduleIcon: Record<ModuleId, string> = {
    home: "🏠",
    writer: "📄",
    sheets: "📊",
    slides: "🖼️",
    forms: "📝",
    notes: "🗒️",
    calendar: "📅"
  };

  const moduleLabel: Record<ModuleId, string> = {
    home: "Home",
    writer: "Docs",
    sheets: "Sheets",
    slides: "Slides",
    forms: "Forms",
    notes: "Notes",
    calendar: "Calendar"
  };

  const modules: ModuleId[] = ["writer", "sheets", "slides", "forms", "notes", "calendar"];

  $: recentDocs = $fileMetas
    .filter((f) => !f.trashed)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  function go(m: ModuleId): void {
    activeModule.set(m);
    if (m === "home") activeFileId.set(null);
  }

  function iconForKind(kind: SosFileMeta["kind"]): string {
    switch (kind) {
      case "document": return "📄";
      case "spreadsheet": return "📊";
      case "deck": return "🖼️";
      case "form": return "📝";
      case "note": return "🗒️";
    }
  }
</script>

{#if $sidebarOpen}
  <aside class="w-48 shrink-0 flex flex-col glass-bar border-r border-white/40 dark:border-white/10 overflow-y-auto">
    <nav class="p-1.5 space-y-0.5">
      <button class="btn btn-ghost w-full !justify-start !h-7 text-xs" on:click={() => go("home")}>
        <span>{moduleIcon.home}</span> Home
      </button>
      {#each modules as m (m)}
        <button
          class="btn btn-ghost w-full !justify-start !h-7 text-xs"
          style={activeModuleId === m ? "background:var(--glass-bg-soft);box-shadow:var(--glass-edge)" : ""}
          on:click={() => go(m)}
        >
          <span>{moduleIcon[m]}</span> {moduleLabel[m]}
        </button>
      {/each}
    </nav>

    <div class="mt-1 border-t border-white/40 dark:border-white/10 pt-1.5 px-1.5 space-y-0.5">
      <button class="btn btn-ghost w-full !justify-start !h-7 text-xs" on:click={() => createFile("document")}>
        <span>＋</span> New document
      </button>
      <button class="btn btn-ghost w-full !justify-start !h-7 text-xs" on:click={() => createFile("spreadsheet")}>
        <span>＋</span> New spreadsheet
      </button>
      <button class="btn btn-ghost w-full !justify-start !h-7 text-xs" on:click={() => createFile("deck")}>
        <span>＋</span> New presentation
      </button>
    </div>

    <div class="mt-3 px-1.5 pb-4">
      <p class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 px-1.5">Recent files</p>
      {#each recentDocs as f (f.id)}
        <button
          class="menu-item !px-1.5 w-full !text-xs"
          title={f.name}
          on:click={() => openInEditor(f.id)}
        >
          <span>{iconForKind(f.kind)}</span>
          <span class="truncate">{f.name}</span>
        </button>
      {/each}
      {#if recentDocs.length === 0}
        <p class="text-[10px] text-gray-400 px-1.5">No files yet — create one!</p>
      {/if}
    </div>
  </aside>
{/if}
