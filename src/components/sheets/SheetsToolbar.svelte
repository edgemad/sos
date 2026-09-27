<script lang="ts">
  // Sheets toolbar mirroring Google Sheets. Emits cmd events.
  
  interface CmdDetail { cmd: string; payload?: string }
  // Callback prop (robust across Svelte HMR; replaces createEventDispatcher)
  export let onCmd: (detail: { cmd: string; payload?: string }) => void = () => {};


  export let zoom = 100;

  let openMenu: string | null = null;
  let fontSize = 10;

  const textColors = ["#000000","#434343","#666666","#999999","#ffffff","#980000","#ff0000","#ff9900","#ffff00","#00ff00","#00ffff","#4a86e8","#0000ff","#9900ff","#ff00ff"];
  const fills = ["#ffffff","#fff2cc","#fce8e6","#e6f4ea","#e8f0fe","#f3e8fd","#fef7e0","#f1f3f4","#d9ead3","#cfe2f3"];

  function fire(cmd: string, payload?: string): void {
    onCmd({ cmd, payload });
    window.dispatchEvent(new CustomEvent("sos-cmd-sheets", { detail: { cmd, payload } }));
    openMenu = null;
  }

  function step(delta: number): void {
    fontSize = Math.min(48, Math.max(6, fontSize + delta));
    fire("size", String(fontSize));
  }

  function inputText(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }
</script>

<svelte:window on:click={() => (openMenu = null)} />

<div class="relative z-20 flex items-center gap-0.5 px-2 h-10 overflow-x-auto bg-gray-50 dark:bg-[#2d2d2d] border-b border-gray-200 dark:border-gray-700 select-none">
  <button class="tb" title="Undo (⌘Z)" on:click={() => fire("undo")}>↺</button>
  <button class="tb" title="Redo (⌘Y)" on:click={() => fire("redo")}>↻</button>
  <button class="tb" title="Print (⌘P)" on:click={() => fire("print")}>🖨</button>
  <button class="tb" title="Paint format" on:click={() => fire("paint")}>🖌</button>
  <span class="tbsep" />

  <div class="relative" on:click|stopPropagation>
    <button class="tb w-[64px] justify-center gap-1" title="Zoom" on:click={() => (openMenu = openMenu === "zoom" ? null : "zoom")}>
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

  <button class="tb font-semibold" title="Format as currency" on:click={() => fire("fmt", "currency")}>$</button>
  <button class="tb" title="Format as percent" on:click={() => fire("fmt", "percent")}>%</button>
  <button class="tb text-xs" title="Decrease decimal places" on:click={() => fire("fmt", "round0")}>.0<span class="text-[8px]">←</span></button>
  <button class="tb text-xs" title="Increase decimal places" on:click={() => fire("fmt", "round2")}>.00<span class="text-[8px]">→</span></button>

  <div class="relative" on:click|stopPropagation>
    <button class="tb w-9 justify-center gap-0.5" title="More formats (123)" on:click={() => (openMenu = openMenu === "fmt" ? null : "fmt")}>
      123 <span class="text-[9px]">▼</span>
    </button>
    {#if openMenu === "fmt"}
      <div class="menu left-0 top-[38px] min-w-[190px]">
        <button class="menu-item" on:click={() => fire("fmt", "auto")}>Automatic</button>
        <button class="menu-item" on:click={() => fire("fmt", "number")}>Number (1,234.56)</button>
        <button class="menu-item" on:click={() => fire("fmt", "currency")}>Currency ($1,234.56)</button>
        <button class="menu-item" on:click={() => fire("fmt", "percent")}>Percent (12.34%)</button>
        <button class="menu-item" on:click={() => fire("fmt", "round0")}>Number · 0 decimals</button>
        <button class="menu-item" on:click={() => fire("fmt", "round2")}>Number · 2 decimals</button>
        <button class="menu-item" on:click={() => fire("fmt", "plain")}>Plain text</button>
      </div>
    {/if}
  </div>
  <span class="tbsep" />

  <button class="tb !px-1.5" title="Decrease font size" on:click={() => step(-1)}>−</button>
  <input
    class="w-9 h-6 text-center text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent"
    value={fontSize}
    on:keydown={(e) => { if (e.key === "Enter") fire("size", inputText(e)); }}
    on:change={(e) => fire("size", inputText(e))}
  />
  <button class="tb !px-1.5" title="Increase font size" on:click={() => step(1)}>+</button>
  <span class="tbsep" />

  <button class="tb font-bold" title="Bold (⌘B)" on:click={() => fire("bold")}>B</button>
  <button class="tb italic" title="Italic (⌘I)" on:click={() => fire("italic")}>I</button>
  <button class="tb line-through" title="Strikethrough" on:click={() => fire("strike")}>S</button>

  <div class="relative" on:click|stopPropagation>
    <button class="tb" title="Text color" on:click={() => (openMenu = openMenu === "color" ? null : "color")}>
      <span class="flex flex-col items-center leading-none"><span class="text-[13px]">A</span><span class="w-4 h-[3px] bg-red-600 rounded-sm" /></span>
    </button>
    {#if openMenu === "color"}
      <div class="menu left-0 top-[38px] p-2 !min-w-0">
        <div class="grid grid-cols-5 gap-1">
          {#each textColors as c (c)}
            <button class="w-6 h-6 rounded border border-gray-300" style={`background:${c}`} title={c} on:click={() => fire("color", c)} />
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="relative" on:click|stopPropagation>
    <button class="tb" title="Fill color" on:click={() => (openMenu = openMenu === "bg" ? null : "bg")}>
      <span class="flex flex-col items-center leading-none"><span class="text-[13px]">🪣</span><span class="w-4 h-[3px] bg-yellow-300 rounded-sm" /></span>
    </button>
    {#if openMenu === "bg"}
      <div class="menu left-0 top-[38px] p-2 !min-w-0">
        <div class="grid grid-cols-5 gap-1">
          {#each fills as c (c)}
            <button class="w-6 h-6 rounded border border-gray-300" style={`background:${c}`} title={c} on:click={() => fire("bg", c)} />
          {/each}
        </div>
      </div>
    {/if}
  </div>
  <span class="tbsep" />

  <button class="tb" title="Insert function (Σ)" on:click={() => fire("fn", "SUM")}>Σ</button>
  <button class="tb" title="Create filter" on:click={() => fire("data:filter")}>⧩</button>

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
