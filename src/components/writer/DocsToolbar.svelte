<script lang="ts">
  // Docs-style toolbar. Mirrors the Google Docs toolbar order and behavior;
  // emits command events consumed by Writer.
    import type { WriterSettings } from "../../types";

  interface CmdDetail { cmd: string; payload?: string }
  // Callback prop (robust across Svelte HMR; replaces createEventDispatcher)
  export let onCmd: (detail: { cmd: string; payload?: string }) => void = () => {};


  export let zoom = 100;
  export let settings: Partial<WriterSettings> = {};

  let openMenu: string | null = null;
  let fontSize = 11;
  let fontLabel = "Arial";

  const fontFamilies = [
    { value: "Arial, Helvetica, sans-serif", label: "Arial" },
    { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
    { value: "Georgia, serif", label: "Georgia" },
    { value: "Verdana, sans-serif", label: "Verdana" },
    { value: "'Trebuchet MS', sans-serif", label: "Trebuchet MS" },
    { value: "'Courier New', monospace", label: "Courier New" },
    { value: "Impact, sans-serif", label: "Impact" },
    { value: "'Comic Sans MS', 'Chalkboard SE', cursive", label: "Comic Sans MS" },
    { value: "Garamond, serif", label: "Garamond" },
    { value: "'Palatino Linotype', 'Book Antiqua', serif", label: "Palatino" }
  ];

  const textColors = ["#000000","#434343","#666666","#999999","#ffffff","#980000","#ff0000","#ff9900","#ffff00","#00ff00","#00ffff","#4a86e8","#0000ff","#9900ff","#ff00ff"];
  const highlightColors = ["#ffffff","#fff475","#aecbfa","#d7aefb","#fbbc04","#fcc2b7","#ccff90","#a2e3fc","#e6b8af","#dddddd"];

  const styles = [
    { v: "p", label: "Normal text" },
    { v: "title", label: "Title" },
    { v: "h1", label: "Heading 1" },
    { v: "h2", label: "Heading 2" },
    { v: "h3", label: "Heading 3" },
    { v: "h4", label: "Heading 4" },
    { v: "blockquote", label: "Quote" },
    { v: "pre", label: "Code block" }
  ];

  const spacings = ["1", "1.15", "1.5", "2"];

  function fire(cmd: string, payload?: string): void {
    onCmd({ cmd, payload });
    window.dispatchEvent(new CustomEvent("sos-cmd-writer", { detail: { cmd, payload } }));
    openMenu = null;
  }

  function stepSize(delta: number): void {
    fontSize = Math.min(96, Math.max(6, fontSize + delta));
    fire("fontSizePx", String(fontSize));
  }

  function inputText(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }
</script>

<svelte:window on:click={() => (openMenu = null)} />

<div class="relative z-20 flex items-center gap-0.5 px-2 h-10 overflow-x-auto bg-gray-50 dark:bg-[#2d2d2d] border-b border-gray-200 dark:border-gray-700 select-none">
  <!-- undo / redo / print / paint -->
  <button class="tb" title="Undo (⌘Z)" on:click={() => fire("undo")}>↺</button>
  <button class="tb" title="Redo (⌘Y)" on:click={() => fire("redo")}>↻</button>
  <button class="tb" title="Print (⌘P)" on:click={() => fire("print")}>🖨</button>
  <button class="tb" title="Paint format" on:click={() => fire("paintFormat")}>🖌</button>
  <span class="tbsep" />

  <!-- zoom -->
  <div class="relative" on:click|stopPropagation>
    <button class="tb w-[68px] justify-center gap-1" title="Zoom" on:click={() => (openMenu = openMenu === "zoom" ? null : "zoom")}>
      {zoom}% <span class="text-[9px]">▼</span>
    </button>
    {#if openMenu === "zoom"}
      <div class="menu left-0 top-[38px] min-w-[90px]">
        {#each [50, 75, 90, 100, 125, 150, 200] as z (z)}
          <button class="menu-item" on:click={() => fire("zoom", String(z))}>{z}%</button>
        {/each}
      </div>
    {/if}
  </div>
  <span class="tbsep" />

  <!-- paragraph styles -->
  <div class="relative" on:click|stopPropagation>
    <button class="tb w-[120px] justify-between" title="Styles" on:click={() => (openMenu = openMenu === "style" ? null : "style")}>
      <span class="truncate">Normal text</span> <span class="text-[9px]">▼</span>
    </button>
    {#if openMenu === "style"}
      <div class="menu left-0 top-[38px] min-w-[160px]">
        {#each styles as s (s.v)}
          <button class="menu-item" on:click={() => fire("style", s.v)}>{s.label}</button>
        {/each}
      </div>
    {/if}
  </div>
  <span class="tbsep" />

  <!-- font family -->
  <div class="relative" on:click|stopPropagation>
    <button class="tb w-[110px] justify-between" title="Font" on:click={() => (openMenu = openMenu === "font" ? null : "font")}>
      <span class="truncate">{fontLabel}</span> <span class="text-[9px]">▼</span>
    </button>
    {#if openMenu === "font"}
      <div class="menu left-0 top-[38px] min-w-[170px]">
        {#each fontFamilies as f (f.value)}
          <button class="menu-item" style={`font-family:${f.value}`} on:click={() => { fontLabel = f.label; fire("fontName", f.value); }}>
            {f.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <span class="tbsep" />

  <!-- size stepper -->
  <button class="tb !px-1.5" title="Decrease font size" on:click={() => stepSize(-1)}>−</button>
  <input
    class="w-9 h-6 text-center text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent"
    value={fontSize}
    on:keydown={(e) => { if (e.key === "Enter") fire("fontSizePx", inputText(e)); }}
    on:change={(e) => fire("fontSizePx", inputText(e))}
  />
  <button class="tb !px-1.5" title="Increase font size" on:click={() => stepSize(1)}>+</button>
  <span class="tbsep" />

  <!-- bold / italic / underline / colors -->
  <button class="tb font-bold" title="Bold (⌘B)" on:click={() => fire("bold")}>B</button>
  <button class="tb italic" title="Italic (⌘I)" on:click={() => fire("italic")}>I</button>
  <button class="tb underline" title="Underline (⌘U)" on:click={() => fire("underline")}>U</button>

  <div class="relative" on:click|stopPropagation>
    <button class="tb" title="Text color" on:click={() => (openMenu = openMenu === "color" ? null : "color")}>
      <span class="flex flex-col items-center leading-none"><span class="text-[13px]">A</span><span class="w-4 h-[3px] bg-red-600 rounded-sm" /></span>
    </button>
    {#if openMenu === "color"}
      <div class="menu left-0 top-[38px] p-2 !min-w-0">
        <div class="grid grid-cols-5 gap-1">
          {#each textColors as c (c)}
            <button class="w-6 h-6 rounded border border-gray-300" style={`background:${c}`} title={c} on:click={() => fire("foreColor", c)} />
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="relative" on:click|stopPropagation>
    <button class="tb" title="Highlight color" on:click={() => (openMenu = openMenu === "hl" ? null : "hl")}>
      <span class="text-[15px]">🖍</span>
    </button>
    {#if openMenu === "hl"}
      <div class="menu left-0 top-[38px] p-2 !min-w-0">
        <div class="grid grid-cols-5 gap-1">
          {#each highlightColors as c (c)}
            <button class="w-6 h-6 rounded border border-gray-300" style={`background:${c}`} title={c} on:click={() => fire("hiliteColor", c)} />
          {/each}
        </div>
      </div>
    {/if}
  </div>
  <span class="tbsep" />

  <!-- link / comment / image -->
  <button class="tb" title="Insert link (⌘K)" on:click={() => fire("createLink")}>🔗</button>
  <button class="tb" title="Insert image" on:click={() => fire("insert:image")}>🖼</button>
  <button class="tb" title="Attach file" on:click={() => fire("insert:attachment")}>📎</button>
  <span class="tbsep" />

  <!-- lists -->
  <button class="tb" title="Bulleted list" on:click={() => fire("insertUnorderedList")}>•≡</button>
  <button class="tb" title="Numbered list" on:click={() => fire("insertOrderedList")}>1≡</button>
  <button class="tb" title="Checklist" on:click={() => fire("sos:checklist")}>☑</button>
  <span class="tbsep" />

  <!-- indent / align / spacing -->
  <button class="tb" title="Decrease indent" on:click={() => fire("outdent")}>⇤</button>
  <button class="tb" title="Increase indent" on:click={() => fire("indent")}>⇥</button>

  <div class="relative" on:click|stopPropagation>
    <button class="tb" title="Align" on:click={() => (openMenu = openMenu === "align" ? null : "align")}>≡</button>
    {#if openMenu === "align"}
      <div class="menu left-0 top-[38px] min-w-[110px]">
        <button class="menu-item" on:click={() => fire("justifyLeft")}>Left</button>
        <button class="menu-item" on:click={() => fire("justifyCenter")}>Center</button>
        <button class="menu-item" on:click={() => fire("justifyRight")}>Right</button>
        <button class="menu-item" on:click={() => fire("justifyFull")}>Justified</button>
      </div>
    {/if}
  </div>

  <div class="relative" on:click|stopPropagation>
    <button class="tb" title="Line spacing" on:click={() => (openMenu = openMenu === "spacing" ? null : "spacing")}>⇕</button>
    {#if openMenu === "spacing"}
      <div class="menu left-0 top-[38px] min-w-[110px]">
        {#each spacings as s (s)}
          <button class="menu-item" on:click={() => fire("lineSpacing", s)}>{s}×</button>
        {/each}
      </div>
    {/if}
  </div>

  <button class="tb" title="Clear formatting (⌘\)" on:click={() => fire("removeFormat")}>⌫T</button>

  <style>
    .tb {
      @apply h-7 min-w-[28px] px-1 inline-flex items-center justify-center rounded text-sm
        text-gray-700 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700 cursor-pointer shrink-0;
    }
    .tbsep {
      @apply w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1 shrink-0;
    }
  </style>
</div>
