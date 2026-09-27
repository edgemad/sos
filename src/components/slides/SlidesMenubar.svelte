<script lang="ts">
  // Slides menubar mirroring Google Slides. Emits `cmd` events with payloads.
  
  interface CmdDetail { cmd: string; payload?: string }
  // Callback prop (robust across Svelte HMR; replaces createEventDispatcher)
  export let onCmd: (detail: { cmd: string; payload?: string }) => void = () => {};


  let open: string | null = null;

  function fire(id: string, payload?: string): void {
    onCmd({ cmd: id, payload });
    window.dispatchEvent(new CustomEvent("sos-cmd-slides", { detail: { cmd: id, payload } }));
    open = null;
  }

  interface Entry { id: string; label: string; sep?: boolean; hint?: string }

  const menus: { id: string; label: string; entries: Entry[] }[] = [
    {
      id: "file", label: "File", entries: [
        { id: "file:new", label: "New presentation" },
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
        { id: "edit:select-all", label: "Select all", hint: "⌘A" },
        { id: "edit:delete", label: "Delete", hint: "⌫" },
        { id: "edit:duplicate", label: "Duplicate", hint: "⌘D" },
        { id: "s3", label: "", sep: true },
        { id: "edit:find", label: "Find and replace…", hint: "⌘F" }
      ]
    },
    {
      id: "view", label: "View", entries: [
        { id: "view:zoom-in", label: "Zoom in", hint: "⌘+" },
        { id: "view:zoom-out", label: "Zoom out", hint: "⌘−" },
        { id: "view:zoom-fit", label: "Fit to window" },
        { id: "view:zoom-100", label: "Zoom · 100%" },
        { id: "s1", label: "", sep: true },
        { id: "view:fullscreen", label: "Full screen" },
        { id: "view:ruler", label: "Show ruler" },
        { id: "view:snap", label: "Snap to grid" }
      ]
    },
    {
      id: "insert", label: "Insert", entries: [
        { id: "block:image", label: "Image…" },
        { id: "block:text", label: "Text box" },
        { id: "block:shape", label: "Shape" },
        { id: "block:line", label: "Line" },
        { id: "block:code", label: "Code snippet" },
        { id: "s1", label: "", sep: true },
        { id: "insert:layout", label: "Apply layout…" },
        { id: "insert:link", label: "Link…", hint: "⌘K" },
        { id: "s2", label: "", sep: true },
        { id: "insert:slide-numbers", label: "Slide numbers" },
        { id: "insert:emoji", label: "Emoji…" },
        { id: "s3", label: "", sep: true },
        { id: "insert:new-slide", label: "New slide", hint: "⌘M" },
        { id: "insert:templates", label: "Templates…" }
      ]
    },
    {
      id: "format", label: "Format", entries: [
        { id: "fmt:bold", label: "Bold", hint: "⌘B" },
        { id: "fmt:italic", label: "Italic", hint: "⌘I" },
        { id: "s1", label: "", sep: true },
        { id: "fmt:color", label: "Text color…" },
        { id: "fmt:size-up", label: "Increase font size", hint: "⌘⇧>" },
        { id: "fmt:size-down", label: "Decrease font size", hint: "⌘⇧<" },
        { id: "s2", label: "", sep: true },
        { id: "fmt:align-left", label: "Align · Left" },
        { id: "fmt:align-center", label: "Align · Center" },
        { id: "fmt:align-right", label: "Align · Right" },
        { id: "s3", label: "", sep: true },
        { id: "fmt:clear", label: "Clear formatting" }
      ]
    },
    {
      id: "slide", label: "Slide", entries: [
        { id: "insert:new-slide", label: "New slide", hint: "⌘M" },
        { id: "slide:duplicate", label: "Duplicate slide" },
        { id: "slide:delete", label: "Delete slide" },
        { id: "slide:skip", label: "Skip / include slide" },
        { id: "s1", label: "", sep: true },
        { id: "slide:move-up", label: "Move slide · earlier" },
        { id: "slide:move-down", label: "Move slide · later" },
        { id: "s2", label: "", sep: true },
        { id: "slide:layout", label: "Apply layout…" },
        { id: "slide:background", label: "Change background…" },
        { id: "slide:transition", label: "Transition…" },
        { id: "slide:theme", label: "Change theme…" }
      ]
    },
    {
      id: "arrange", label: "Arrange", entries: [
        { id: "arrange:front", label: "Bring to front" },
        { id: "arrange:back", label: "Send to back" },
        { id: "s1", label: "", sep: true },
        { id: "arrange:align-left", label: "Align · Left edge" },
        { id: "arrange:align-center", label: "Align · Horizontal center" },
        { id: "arrange:align-right", label: "Align · Right edge" },
        { id: "arrange:align-top", label: "Align · Top edge" },
        { id: "arrange:align-middle", label: "Align · Vertical center" },
        { id: "arrange:align-bottom", label: "Align · Bottom edge" },
        { id: "s2", label: "", sep: true },
        { id: "arrange:dist-h", label: "Distribute · Horizontally" },
        { id: "arrange:dist-v", label: "Distribute · Vertically" },
        { id: "s3", label: "", sep: true },
        { id: "arrange:rot-cw", label: "Rotate · 90° clockwise" },
        { id: "arrange:rot-ccw", label: "Rotate · 90° counterclockwise" },
        { id: "arrange:flip-h", label: "Flip · Horizontal" },
        { id: "arrange:flip-v", label: "Flip · Vertical" }
      ]
    },
    {
      id: "tools", label: "Tools", entries: [
        { id: "tools:wordcount", label: "Word count…" },
        { id: "tools:spelling", label: "Spelling" },
        { id: "s1", label: "", sep: true },
        { id: "tools:links", label: "Linked objects" },
        { id: "tools:shortcuts", label: "Keyboard shortcuts" }
      ]
    },
    {
      id: "extensions", label: "Extensions", entries: [
        { id: "ext:addons", label: "Add-ons…" },
        { id: "ext:script", label: "Macros · record batch actions" }
      ]
    },
    {
      id: "help", label: "Help", entries: [
        { id: "help:search", label: "Search the menus" },
        { id: "s1", label: "", sep: true },
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
