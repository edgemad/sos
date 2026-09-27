<script lang="ts">
  // Drive-style home: template gallery, recent files, search, filter chips,
  // star / trash management. The suite's launch surface.
  import {
    state,
    fileMetas,
    createFile,
    openInEditor,
    toggleStar,
    trashFile,
    restoreFile,
    deleteForever,
    emptyTrash,
    setColor
  } from "../../lib/state";
  import type { DocKind, SosFileMeta } from "../../types";

  type Bucket = "all" | "document" | "spreadsheet" | "deck" | "form" | "starred" | "trash";

  let query = "";
  let bucket: Bucket = "all";
  let view: "grid" | "list" = "grid";
  let colorMenuFor: string | null = null;

  const palette = ["#ffffff", "#fff475", "#aecbfa", "#d7aefb", "#fcc2b7", "#ccff90"];

  const templates: { kind: DocKind; icon: string; label: string; blurb: string; accent: string }[] = [
    { kind: "document", icon: "📄", label: "Blank document", blurb: "Rich text with headings, tables & exports", accent: "#1a73e8" },
    { kind: "spreadsheet", icon: "📊", label: "Blank spreadsheet", blurb: "Formulas, CSV import/export, live recalc", accent: "#0f9d58" },
    { kind: "deck", icon: "🖼️", label: "Blank presentation", blurb: "16:9 slides with presenter view", accent: "#f4b400" },
    { kind: "form", icon: "📝", label: "Blank form", blurb: "Surveys & quizzes with response tally", accent: "#7248b9" }
  ];

  const bucketLabel: Record<Bucket, string> = {
    all: "All files",
    document: "Documents",
    spreadsheet: "Spreadsheets",
    deck: "Presentations",
    form: "Forms",
    starred: "Starred",
    trash: "Trash"
  };

  $: metas = ($fileMetas as SosFileMeta[]);
  $: visible = metas
    .filter((f) => (bucket === "trash" ? f.trashed : !f.trashed))
    .filter((f) => {
      if (bucket === "starred") return f.starred;
      if (bucket === "all" || bucket === "trash") return true;
      return f.kind === bucket;
    })
    .filter((f) => !query || f.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  $: counts = {
    document: metas.filter((f) => f.kind === "document" && !f.trashed).length,
    spreadsheet: metas.filter((f) => f.kind === "spreadsheet" && !f.trashed).length,
    deck: metas.filter((f) => f.kind === "deck" && !f.trashed).length,
    form: metas.filter((f) => f.kind === "form" && !f.trashed).length,
    starred: metas.filter((f) => f.starred && !f.trashed).length,
    trash: metas.filter((f) => f.trashed).length
  };

  function iconFor(kind: DocKind): string {
    switch (kind) {
      case "document": return "📄";
      case "spreadsheet": return "📊";
      case "deck": return "🖼️";
      case "form": return "📝";
      case "note": return "🗒️";
    }
  }

  function accentFor(kind: DocKind): string {
    switch (kind) {
      case "document": return "#1a73e8";
      case "spreadsheet": return "#0f9d58";
      case "deck": return "#f4b400";
      case "form": return "#7248b9";
      case "note": return "#fbbc04";
    }
  }

  function fmtWhen(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function kindWord(kind: DocKind): string {
    switch (kind) {
      case "document": return "Document";
      case "spreadsheet": return "Spreadsheet";
      case "deck": return "Presentation";
      case "form": return "Form";
      case "note": return "Note";
    }
  }

  const bucketKeys = Object.keys(bucketLabel);

  function setBucket(b: string): void {
    bucket = b as Bucket;
  }

  function countFor(b: string): number {
    return counts[b as keyof typeof counts] ?? 0;
  }

  function bucketLabelOf(b: string): string {
    return bucketLabel[b as Bucket];
  }
</script>

<div class="flex-1 overflow-y-auto">
  <!-- Template gallery -->
  <section class="px-6 pt-6 max-w-[1100px] mx-auto w-full">
    <div class="flex items-end justify-between mb-3">
      <h1 class="text-xl font-medium">Start something new</h1>
      <div class="flex gap-1">
        <button
          class="btn btn-ghost !px-2"
          title="Grid view"
          style={view === "grid" ? "background:rgba(0,0,0,.06)" : ""}
          on:click={() => (view = "grid")}
        >▦</button>
        <button
          class="btn btn-ghost !px-2"
          title="List view"
          style={view === "list" ? "background:rgba(0,0,0,.06)" : ""}
          on:click={() => (view = "list")}
        >☰</button>
      </div>
    </div>

    <div class="flex gap-3 overflow-x-auto pb-2">
      {#each templates as t (t.kind)}
        <button
          class="card p-4 w-[190px] shrink-0 text-left hover:shadow-modal transition-shadow"
          on:click={() => createFile(t.kind)}
        >
          <div
            class="w-10 h-10 rounded-full grid place-items-center text-xl mb-3"
            style={`background:${t.accent}22`}
          >{t.icon}</div>
          <p class="font-medium text-sm">{t.label}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">{t.blurb}</p>
        </button>
      {/each}
    </div>
  </section>

  <!-- Search + filter chips -->
  <section class="px-6 mt-6 max-w-[1100px] mx-auto w-full">
    <div class="flex flex-wrap items-center gap-2">
      <input
        class="input w-72"
        placeholder="🔍 Search your files…"
        bind:value={query}
      />
      {#each bucketKeys as b}
        <button
          class="chip cursor-pointer border border-gray-200 dark:border-gray-600
            {bucket === b ? 'bg-docs text-white border-docs' : 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
          on:click={() => setBucket(b)}
        >
          {bucketLabelOf(b)}
          {#if b !== 'all'}
            <span class="opacity-70">{countFor(b)}</span>
          {/if}
        </button>
      {/each}
      {#if bucket === "trash" && counts.trash > 0}
        <button class="btn btn-ghost text-red-600 dark:text-red-400" on:click={() => emptyTrash()}>
          Empty trash
        </button>
      {/if}
    </div>
  </section>

  <!-- File listing -->
  <section class="px-6 mt-4 pb-10 max-w-[1100px] mx-auto w-full">
    {#if visible.length === 0}
      <div class="text-center py-16 text-gray-400">
        <p class="text-4xl mb-2">🗂️</p>
        <p class="text-sm">
          {bucket === "trash" ? "Trash is empty" : "No files here yet — start with a template above."}
        </p>
      </div>
    {:else if view === "grid"}
      <div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">
        {#each visible as f (f.id)}
          <div class="card overflow-hidden group relative hover:shadow-modal transition-shadow">
            <button class="block w-full text-left" on:click={() => openInEditor(f.id)}>
              <div
                class="h-[110px] grid place-items-center text-4xl"
                style={`background:${f.color ?? accentFor(f.kind)}14`}
              >
                {iconFor(f.kind)}
              </div>
              <div class="p-3">
                <p class="text-sm font-medium truncate" title={f.name}>{f.name}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                  {#if f.starred}<span title="Starred">★</span>{/if}
                  {kindWord(f.kind)} · {fmtWhen(f.updatedAt)}
                </p>
              </div>
            </button>
            <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                class="w-7 h-7 grid place-items-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow-card text-sm"
                title={f.starred ? "Unstar" : "Star"}
                on:click={() => toggleStar(f.id)}
              >{f.starred ? "★" : "☆"}</button>
              {#if !f.trashed}
                <button
                  class="w-7 h-7 grid place-items-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow-card text-sm"
                  title="Move to trash"
                  on:click={() => trashFile(f.id)}
                >🗑️</button>
              {:else}
                <button
                  class="w-7 h-7 grid place-items-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow-card text-sm"
                  title="Restore"
                  on:click={() => restoreFile(f.id)}
                >♻️</button>
                <button
                  class="w-7 h-7 grid place-items-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow-card text-sm"
                  title="Delete forever"
                  on:click={() => deleteForever(f.id)}
                >✖️</button>
              {/if}
              <button
                class="w-7 h-7 grid place-items-center rounded-full bg-white/90 dark:bg-gray-800/90 shadow-card text-sm"
                title="Change color"
                on:click={() => (colorMenuFor = colorMenuFor === f.id ? null : f.id)}
              >🎨</button>
            </div>
            {#if colorMenuFor === f.id}
              <div class="absolute top-11 right-2 z-30 card p-2 flex gap-1.5 shadow-modal">
                {#each palette as c (c)}
                  <button
                    class="w-6 h-6 rounded-full border border-gray-300"
                    style={`background:${c}`}
                    title={c}
                    on:click={() => { setColor(f.id, c); colorMenuFor = null; }}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="card divide-y divide-gray-200 dark:divide-gray-700">
        {#each visible as f (f.id)}
          <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/40 group">
            <span class="text-lg">{iconFor(f.kind)}</span>
            <button class="flex-1 text-left min-w-0" on:click={() => openInEditor(f.id)}>
              <p class="text-sm font-medium truncate">{f.name}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{kindWord(f.kind)} · {fmtWhen(f.updatedAt)}</p>
            </button>
            <button class="btn btn-ghost !px-1.5 text-sm" title="Star" on:click={() => toggleStar(f.id)}>
              {f.starred ? "★" : "☆"}
            </button>
            {#if f.trashed}
              <button class="btn btn-ghost !px-1.5 text-sm" title="Restore" on:click={() => restoreFile(f.id)}>♻️</button>
              <button class="btn btn-ghost !px-1.5 text-sm" title="Delete forever" on:click={() => deleteForever(f.id)}>✖️</button>
            {:else}
              <button class="btn btn-ghost !px-1.5 text-sm" title="Trash" on:click={() => trashFile(f.id)}>🗑️</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
