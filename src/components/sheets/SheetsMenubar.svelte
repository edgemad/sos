<script lang="ts">
  // Sheets menubar mirroring Google Sheets. Emits `cmd` events with payloads.
  
  interface CmdDetail { cmd: string; payload?: string }
  // Callback prop (robust across Svelte HMR; replaces createEventDispatcher)
  export let onCmd: (detail: { cmd: string; payload?: string }) => void = () => {};


  let open: string | null = null;

  function fire(id: string, payload?: string): void {
    onCmd({ cmd: id, payload });
    window.dispatchEvent(new CustomEvent("sos-cmd-sheets", { detail: { cmd: id, payload } }));
    open = null;
  }

  interface Entry { id: string; label: string; sep?: boolean; hint?: string }

  const menus: { id: string; label: string; entries: Entry[] }[] = [
    {
      id: "file", label: "File", entries: [
        { id: "file:new", label: "New spreadsheet" },
        { id: "file:open", label: "Open…", hint: "⌘O" },
        { id: "file:import", label: "Import file…" },
        { id: "file:copy", label: "Make a copy" },
        { id: "s1", label: "", sep: true },
        { id: "file:download", label: "Download…" },
        { id: "file:save", label: "Save to disk (.sos)", hint: "⌘S" },
        { id: "s2", label: "", sep: true },
        { id: "file:rename", label: "Rename" },
        { id: "file:details", label: "Details" },
        { id: "file:trash", label: "Move to trash" },
        { id: "s3", label: "", sep: true },
        { id: "file:print", label: "Print", hint: "⌘P" }
      ]
    },
    {
      id: "edit", label: "Edit", entries: [
        { id: "undo", label: "Undo", hint: "⌘Z" },
        { id: "redo", label: "Redo", hint: "⌘Y" },
        { id: "s1", label: "", sep: true },
        { id: "edit:cut", label: "Cut", hint: "⌘X" },
        { id: "edit:copy", label: "Copy", hint: "⌘C" },
        { id: "edit:paste", label: "Paste", hint: "⌘V" },
        { id: "s2", label: "", sep: true },
        { id: "edit:find", label: "Find and replace…", hint: "⌘F" },
        { id: "s3", label: "", sep: true },
        { id: "edit:fill-down", label: "Fill down", hint: "⌘D" },
        { id: "edit:fill-right", label: "Fill right", hint: "⌘R" },
        { id: "edit:clear", label: "Clear cell" }
      ]
    },
    {
      id: "view", label: "View", entries: [
        { id: "view:freeze-row", label: "Freeze · 1 row" },
        { id: "view:freeze-col", label: "Freeze · 1 column" },
        { id: "view:unfreeze", label: "Freeze · No rows/columns" },
        { id: "s1", label: "", sep: true },
        { id: "view:zoom-in", label: "Zoom in" },
        { id: "view:zoom-out", label: "Zoom out" },
        { id: "view:zoom-reset", label: "Zoom · 100%" },
        { id: "s2", label: "", sep: true },
        { id: "view:fullscreen", label: "Full screen" }
      ]
    },
    {
      id: "insert", label: "Insert", entries: [
        { id: "insert:row-above", label: "Rows · 1 above" },
        { id: "insert:row-below", label: "Rows · 1 below" },
        { id: "insert:col-left", label: "Columns · 1 left" },
        { id: "insert:col-right", label: "Columns · 1 right" },
        { id: "insert:sheet", label: "New sheet", hint: "⇧F11" },
        { id: "s1", label: "", sep: true },
        { id: "insert:checkbox", label: "Checkbox" },
        { id: "insert:dropdown", label: "Dropdown…" },
        { id: "insert:note", label: "Note…", hint: "⇧F2" },
        { id: "insert:function", label: "Function · Σ SUM" },
        { id: "insert:chart", label: "Chart…" },
        { id: "insert:link", label: "Link…" },
        { id: "s2", label: "", sep: true },
        { id: "insert:emoji", label: "Emoji…" },
        { id: "insert:date", label: "Date" }
      ]
    },
    {
      id: "format", label: "Format", entries: [
        { id: "fmt:bold", label: "Bold", hint: "⌘B" },
        { id: "fmt:italic", label: "Italic", hint: "⌘I" },
        { id: "fmt:strike", label: "Strikethrough" },
        { id: "s1", label: "", sep: true },
        { id: "fmt:number", label: "Number · Number (1,234.56)" },
        { id: "fmt:currency", label: "Number · Currency ($1,234.56)" },
        { id: "fmt:percent", label: "Number · Percent (12.34%)" },
        { id: "fmt:round0", label: "Number · 0 decimal" },
        { id: "fmt:round2", label: "Number · 2 decimals" },
        { id: "fmt:auto", label: "Number · Automatic" },
        { id: "s2", label: "", sep: true },
        { id: "fmt:color", label: "Text color…" },
        { id: "fmt:bg", label: "Fill color…" },
        { id: "s3", label: "", sep: true },
        { id: "fmt:align-left", label: "Alignment · Left" },
        { id: "fmt:align-center", label: "Alignment · Center" },
        { id: "fmt:align-right", label: "Alignment · Right" },
        { id: "s4", label: "", sep: true },
        { id: "fmt:wrap", label: "Wrapping · Clip long text" },
        { id: "fmt:clear", label: "Clear formatting" }
      ]
    },
    {
      id: "data", label: "Data", entries: [
        { id: "data:sort-asc", label: "Sort sheet · A → Z" },
        { id: "data:sort-desc", label: "Sort sheet · Z → A" },
        { id: "s1", label: "", sep: true },
        { id: "data:filter", label: "Create / remove filter" },
        { id: "data:cleanup-trim", label: "Cleanup · Trim whitespace" },
        { id: "data:cleanup-dedupe", label: "Cleanup · Remove duplicates" },
        { id: "data:split", label: "Split text to columns…" },
        { id: "s2", label: "", sep: true },
        { id: "data:stats", label: "Column stats" },
        { id: "data:named-range", label: "Named ranges…" },
        { id: "data:validate", label: "Data validation…" }
      ]
    },
    {
      id: "tools", label: "Tools", entries: [
        { id: "tools:form", label: "Create a new form" },
        { id: "tools:macro", label: "Macros · Record cell actions" },
        { id: "s1", label: "", sep: true },
        { id: "tools:stats", label: "Column stats" },
        { id: "tools:protect", label: "Protect sheet…" }
      ]
    },
    {
      id: "help", label: "Help", entries: [
        { id: "help:search", label: "Search the menus" },
        { id: "s1", label: "", sep: true },
        { id: "help:fnlist", label: "Function list" },
        { id: "help:shortcuts", label: "Keyboard shortcuts" },
        { id: "help:about", label: "About Simple Office Suite" }
      ]
    }
  ];
</script>

<svelte:window on:click={() => (open = null)} />

<div class="relative z-30 flex items-center gap-0.5 px-2 h-8 text-sm bg-gray-50 dark:bg-[#2d2d2d] border-b border-gray-200 dark:border-gray-700 select-none">
  {#each menus as m (m.id)}
    <div class="relative" on:click|stopPropagation>
      <button
        class="px-2 h-6 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700 cursor-pointer text-[13px]
          {open === m.id ? 'bg-gray-200 dark:bg-gray-700' : ''}"
        on:click={() => (open = open === m.id ? null : m.id)}
        on:mouseenter={() => { if (open) open = m.id; }}
      >
        {m.label}
      </button>
      {#if open === m.id}
        <div class="menu left-0 top-[30px] min-w-[270px] shadow-modal max-h-[70vh] overflow-y-auto">
          {#each m.entries as e (e.id)}
            {#if e.sep}
              <div class="menu-sep" />
            {:else}
              <button class="menu-item !py-1.5" on:click={() => fire(e.id)}>
                <span class="flex-1">{e.label}</span>
                {#if e.hint}<span class="text-xs text-gray-400 ml-6">{e.hint}</span>{/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
  <span class="flex-1" />
</div>
