<script lang="ts">
  // Google Docs-style menu bar: File / Edit / View / Insert / Format / Tools /
  // Help with working dropdowns. Emits command events with a payload.
  
  interface CmdDetail { cmd: string; payload?: string }
  // Callback prop (robust across Svelte HMR; replaces createEventDispatcher)
  export let onCmd: (detail: { cmd: string; payload?: string }) => void = () => {};


  export let docTitle = "Untitled document";

  let open: string | null = null;

  interface Entry { id: string; label: string; shortcut?: string; sep?: boolean; sub?: Entry[]; disabled?: boolean }

  function fire(id: string): void {
    onCmd({ cmd: id });
    window.dispatchEvent(new CustomEvent("sos-cmd-writer", { detail: { cmd: id } }));
    open = null;
  }

  function submenu(id: string, payload?: string): void {
    onCmd({ cmd: id, payload });
    window.dispatchEvent(new CustomEvent("sos-cmd-writer", { detail: { cmd: id, payload } }));
    open = null;
  }

  const menus: { id: string; label: string; entries: Entry[] }[] = [
    {
      id: "file",
      label: "File",
      entries: [
        { id: "file:new", label: "New document" },
        { id: "file:open", label: "Open…" },
        { id: "file:import", label: "Import file…" },
        { id: "file:make-copy", label: "Make a copy" },
        { id: "sep1", label: "", sep: true },
        { id: "file:download", label: "Download…" },
        { id: "file:save-sos", label: "Save to disk (.sos)", shortcut: "⌘S" },
        { id: "sep2", label: "", sep: true },
        { id: "file:details", label: "Document details" },
        { id: "file:trash", label: "Move to trash" },
        { id: "sep3", label: "", sep: true },
        { id: "print", label: "Print", shortcut: "⌘P" }
      ]
    },
    {
      id: "edit",
      label: "Edit",
      entries: [
        { id: "undo", label: "Undo", shortcut: "⌘Z" },
        { id: "redo", label: "Redo", shortcut: "⌘Y" },
        { id: "sep-e1", label: "", sep: true },
        { id: "cut", label: "Cut", shortcut: "⌘X" },
        { id: "copy", label: "Copy", shortcut: "⌘C" },
        { id: "paste", label: "Paste", shortcut: "⌘V" },
        { id: "paste-plain", label: "Paste without formatting", shortcut: "⌘⇧V" },
        { id: "sep-e2", label: "", sep: true },
        { id: "select-all", label: "Select all", shortcut: "⌘A" },
        { id: "sep-e3", label: "", sep: true },
        { id: "find", label: "Find and replace", shortcut: "⌘F" }
      ]
    },
    {
      id: "view",
      label: "View",
      entries: [
        { id: "view:mode", label: "Mode · Editing" },
        { id: "sep-v1", label: "", sep: true },
        { id: "view:show-ruler", label: "Show ruler ✓" },
        { id: "view:show-outline", label: "Show outline ✓" },
        { id: "view:pageless", label: "Pageless format" },
        { id: "sep-v2", label: "", sep: true },
        { id: "view:fullscreen", label: "Fullscreen" },
        { id: "view:zoom-in", label: "Zoom in" },
        { id: "view:zoom-out", label: "Zoom out" }
      ]
    },
    {
      id: "insert",
      label: "Insert",
      entries: [
        { id: "insert:image", label: "Image…" },
        { id: "insert:table", label: "Table…" },
        { id: "insert:link", label: "Link…" },
        { id: "insert:hr", label: "Horizontal line" },
        { id: "insert:emoji", label: "Emoji" },
        { id: "insert:special", label: "Special characters…" },
        { id: "sep-i1", label: "", sep: true },
        { id: "insert:pagebreak", label: "Break · Page break" },
        { id: "insert:sectionbreak", label: "Break · Section break" },
        { id: "sep-i2", label: "", sep: true },
        { id: "insert:header", label: "Header & footer" },
        { id: "insert:pagenumbers", label: "Page numbers" },
        { id: "insert:toc", label: "Table of contents" },
        { id: "insert:date", label: "Date" }
      ]
    },
    {
      id: "format",
      label: "Format",
      entries: [
        { id: "fmt:rtl", label: "Right-to-left text" },
        { id: "fmt:ltr", label: "Left-to-right text" },
        { id: "sep-f1", label: "", sep: true },
        { id: "fmt:text-b", label: "Text · Bold", shortcut: "⌘B" },
        { id: "fmt:text-i", label: "Text · Italic", shortcut: "⌘I" },
        { id: "fmt:text-u", label: "Text · Underline", shortcut: "⌘U" },
        { id: "fmt:text-strike", label: "Text · Strikethrough" },
        { id: "fmt:text-sup", label: "Text · Superscript", shortcut: "⌘." },
        { id: "fmt:text-sub", label: "Text · Subscript", shortcut: "⌘," },
        { id: "sep-f2", label: "", sep: true },
        { id: "fmt:ps-normal", label: "Paragraph styles · Normal text" },
        { id: "fmt:ps-h1", label: "Paragraph styles · Heading 1" },
        { id: "fmt:ps-h2", label: "Paragraph styles · Heading 2" },
        { id: "fmt:ps-h3", label: "Paragraph styles · Heading 3" },
        { id: "fmt:ps-title", label: "Paragraph styles · Title" },
        { id: "fmt:ps-quote", label: "Paragraph styles · Quote" },
        { id: "fmt:ps-code", label: "Paragraph styles · Code block" },
        { id: "sep-f3", label: "", sep: true },
        { id: "fmt:align-left", label: "Align · Left" },
        { id: "fmt:align-center", label: "Align · Center" },
        { id: "fmt:align-right", label: "Align · Right" },
        { id: "fmt:align-justify", label: "Align · Justified" },
        { id: "sep-f4", label: "", sep: true },
        { id: "fmt:spacing-single", label: "Line spacing · Single" },
        { id: "fmt:spacing-15", label: "Line spacing · 1.15" },
        { id: "fmt:spacing-double", label: "Line spacing · Double" },
        { id: "sep-f5", label: "", sep: true },
        { id: "fmt:cols-1", label: "Columns · One" },
        { id: "fmt:cols-2", label: "Columns · Two" },
        { id: "fmt:cols-3", label: "Columns · Three" },
        { id: "sep-f6", label: "", sep: true },
        { id: "fmt:orientation-portrait", label: "Page orientation · Portrait" },
        { id: "fmt:orientation-landscape", label: "Page orientation · Landscape" },
        { id: "fmt:clear", label: "Clear formatting", shortcut: "⌘\\" }
      ]
    },
    {
      id: "tools",
      label: "Tools",
      entries: [
        { id: "tools:wordcount", label: "Word count", shortcut: "⌘⇧C" },
        { id: "tools:spell", label: "Spelling and grammar" },
        { id: "tools:find", label: "Find and replace", shortcut: "⌘F" },
        { id: "sep-t1", label: "", sep: true },
        { id: "tools:voice", label: "Voice typing" },
        { id: "tools:speak", label: "Read aloud" },
        { id: "tools:stop-speech", label: "Stop reading aloud" },
        { id: "tools:dictionary", label: "Dictionary" },
        { id: "sep-t2", label: "", sep: true },
        { id: "tools:preferences", label: "Preferences…" },
        { id: "tools:accessibility", label: "Accessibility" }
      ]
    },
    {
      id: "help",
      label: "Help",
      entries: [
        { id: "help:search", label: "Search the menus" },
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
        class="px-2 h-6 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700 cursor-pointer text-[13px]"
        class:bg-blue-100={open === m.id}
        class:dark:bg-gray-700={open === m.id}
        on:click={() => (open = open === m.id ? null : m.id)}
        on:mouseenter={() => { if (open) open = m.id; }}
      >
        {m.label}
      </button>
      {#if open === m.id}
        <div class="menu left-0 top-[30px] min-w-[260px] shadow-modal">
          {#each m.entries as e (e.id)}
            {#if e.sep}
              <div class="menu-sep" />
            {:else}
              <button class="menu-item !py-1.5" on:click={() => fire(e.id)}>
                <span class="flex-1">{e.label}</span>
                {#if e.shortcut}<span class="text-xs text-gray-400 ml-6">{e.shortcut}</span>{/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
  <span class="flex-1" />
  <span class="text-xs text-gray-400 pr-2 hidden md:block">{docTitle}</span>
</div>
